require('dotenv').config();
const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const ini = require('ini');
const querystring = require('querystring');

console.log('Starting application...');

// Read configuration from visualtk.ini
const config = ini.parse(fs.readFileSync('./visualtk.ini', 'utf-8'));
console.log('Configuration loaded from visualtk.ini');

// Add proxy configuration
const httpProxy = process.env.HTTP_PROXY || 'http://172.16.2.254:3128';
const httpsProxy = process.env.HTTPS_PROXY || 'http://172.16.2.254:3128';
console.log(`Proxy configuration set - HTTP: ${httpProxy}, HTTPS: ${httpsProxy}`);

const app = express();
const port = process.env.PORT || 3001;

const outputFolder = 'json';
const interval = '*/5 * * * *'; // Run every 5 minutes
let latestTicketDate = null;

async function login() {
    console.log('Attempting to log in...');
    try {
        const loginUrl = new URL('/service.php/home/login.xml', config.ENDPOINTURL);
        loginUrl.search = querystring.stringify({
            login: config.USERNAME,
            password: config.USERPASS
        });

        console.log(`Making login request to: ${loginUrl.toString()}`);
        const response = await axios.get(loginUrl.toString() );

        console.log(`Received login response. Status: ${response.status}`);
        // Here you might want to check the response for a successful login
        // and possibly store a session token if the API provides one
        return response.data;
    } catch (error) {
        console.error('Error during login:', error.message);
        throw error;
    }
}

async function authenticateAndFetchData(date) {
    console.log(`Attempting to fetch data for date: ${date}`);
    try {
        // First, log in
        await login();

        const url = `${config.ENDPOINTURL}/service.php/api_omomo/Passes.json?date=${date}`;
        console.log(`Making request to: ${url}`);
        const response = await axios.get(url);
        console.log(`Received response for date ${date}. Status: ${response.status}`);
        const xmlData = response.data;
        console.log('Parsing XML data to JSON');
        const jsonData = await xml2js.parseStringPromise(xmlData);
        console.log('XML successfully parsed to JSON');
        return jsonData;
    } catch (error) {
        console.error(`Error fetching data for date ${date}:`, error.message);
        throw error;
    }
}

function saveTicketsToFile(jsonData, date) {
    console.log(`Saving tickets for date: ${date}`);
    if (!fs.existsSync(outputFolder)) {
        console.log(`Creating output folder: ${outputFolder}`);
        fs.mkdirSync(outputFolder, { recursive: true });
    }
    const filename = `tickets_${date}.json`;
    const filePath = path.join(outputFolder, filename);
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
    console.log(`Data saved to file: ${filePath}`);
}

function updateLatestTicketDate(jsonData) {
    console.log('Updating latest ticket date');
    // Assuming the JSON structure has a date field. Adjust this according to your actual data structure.
    const ticketDates = jsonData.passes.pass.map(pass => new Date(pass.date[0]));
    const maxDate = new Date(Math.max.apply(null, ticketDates));
    if (!latestTicketDate || maxDate > latestTicketDate) {
        latestTicketDate = maxDate;
        console.log(`Latest ticket date updated to: ${latestTicketDate.toISOString().split('T')[0]}`);
    } else {
        console.log(`Latest ticket date remains: ${latestTicketDate.toISOString().split('T')[0]}`);
    }
}

async function fetchAndSaveTickets(date) {
    console.log(`Starting fetch and save process for date: ${date}`);
    try {
        const data = await authenticateAndFetchData(date);
        saveTicketsToFile(data, date);
        updateLatestTicketDate(data);
        console.log(`Fetch and save process completed for date: ${date}`);
        return data;
    } catch (error) {
        console.error(`Error during fetch and save process for date ${date}:`, error.message);
    }
}

async function recursivelyFetchTickets() {
    const today = new Date();
    let currentDate = latestTicketDate ? new Date(latestTicketDate) : new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    
    // while (currentDate <= today) {
        // const dateString = currentDate.toISOString().split('T')[0];
    const dateString = '2021-05-01';
        console.log(`Pobieranie biletów dla daty: ${dateString}`);
        await fetchAndSaveTickets(dateString);
        currentDate.setDate(currentDate.getDate() + 1);
    // }
}

// Schedule the task to run at the specified interval
cron.schedule(interval, recursivelyFetchTickets);

app.get('/fetch', async (req, res) => {
    try {
        await recursivelyFetchTickets();
        res.send('Dane zostały pobrane i zapisane.');
    } catch (error) {
        res.status(500).send('Wystąpił błąd podczas pobierania danych.');
    }
});

app.listen(port, () => {
    console.log(`Serwer nasłuchuje na porcie ${port}`);
});

// Initial fetch on startup
recursivelyFetchTickets();
