require('dotenv').config();
const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const ini = require('ini');
const querystring = require('querystring');



// Read configuration from visualtk.ini
const config = ini.parse(fs.readFileSync('./visualtk.ini', 'utf-8'));
console.log('Configuration loaded from visualtk.ini');


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
        const response = await axios.get(loginUrl.toString());

        console.log(`Received login response. Status: ${response.status}`);
        console.log(`Response data: ${response.data}`);
        
        // Parse the XML response
        const parsedResponse = await xml2js.parseStringPromise(response.data);
        
        // Extract the session token from the parsed response
        const sessionToken = parsedResponse.logged.session[0];
        
        if (!sessionToken) {
            throw new Error('Session token not found in the response');
        }
        
        // Save the token to a file
        const tokenFilePath = path.join(__dirname, 'token.txt');
        fs.writeFileSync(tokenFilePath, sessionToken, 'utf-8');
        console.log(`Session token saved to file: ${tokenFilePath}`);

        return sessionToken;
    } catch (error) {
        console.error('Error during login:', error.message);
        throw error;
    }
}

async function authenticateAndFetchData(date, retryCount = 0) {
    console.log(`Attempting to fetch data for date: ${date}`);
    try {
        // First, log in and get the session token
        const sessionToken = await login();

        // Add a small delay to ensure the session is established
        await new Promise(resolve => setTimeout(resolve, 1000));

        const url = `${config.ENDPOINTURL}/service.php/api_omomo/Passes.json?date=${date}`;
        console.log(`Making request to: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'Cookie': `PHPSESSID=${sessionToken}; symfony=${sessionToken}`,
                'Accept': 'application/json',
                'User-Agent': 'YourAppName/1.0',  // Replace with your app name and version
                'X-Requested-With': 'XMLHttpRequest'
            },
            validateStatus: function (status) {
                return status < 500; // Resolve only if the status code is less than 500
            }
        });
        
        console.log(`Received response for date ${date}. Status: ${response.status}`);
        console.log(`Response headers:`, response.headers);
        console.log(`Response data:`, response.data);

        if (response.status === 401 || (response.status === 500 && response.data.code === 401)) {
            if (retryCount < 3) {
                console.log(`Authentication failed. Retrying... (Attempt ${retryCount + 1})`);
                return authenticateAndFetchData(date, retryCount + 1);
            } else {
                throw new Error('Authentication failed after multiple attempts');
            }
        }

        if (response.status !== 200) {
            throw new Error(`Unexpected status code: ${response.status}`);
        }

        const jsonData = response.data;
        console.log('Successfully retrieved JSON data');
        return jsonData;
    } catch (error) {
        console.error(`Error fetching data for date ${date}:`, error.message);
        if (error.response) {
            console.error('Error response:', error.response.data);
            console.error('Error status:', error.response.status);
            console.error('Error headers:', error.response.headers);
        } else if (error.request) {
            console.error('Error request:', error.request);
        }
        throw error;
    }
}

function saveTicketsToFile(jsonData, date) {
    console.log(`Saving tickets for date: ${date}`);
    if (!fs.existsSync(outputFolder)) {
        console.log(`Creating output folder: ${outputFolder}`);
        fs.mkdirSync(outputFolder, { recursive: true });
    }
    const filename = `${date}.json`;
    const filePath = path.join(outputFolder, filename);
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
    console.log(`Data saved to file: ${filePath}`);
}

function updateLatestTicketDate(jsonData) {
    console.log('Updating latest ticket date');
    if (jsonData.passes && Array.isArray(jsonData.passes)) {
        const ticketDates = jsonData.passes.map(pass => new Date(pass.buy_date));
        const maxDate = new Date(Math.max.apply(null, ticketDates));
        if (!latestTicketDate || maxDate > latestTicketDate) {
            latestTicketDate = maxDate;
            console.log(`Latest ticket date updated to: ${latestTicketDate.toISOString()}`);
        } else {
            console.log(`Latest ticket date remains: ${latestTicketDate.toISOString()}`);
        }
    } else {
        console.log('No valid passes found in the data');
    }
}

async function fetchAndSaveTickets() {
    console.log('Starting fetch and save process');
    try {
        const currentDate = new Date();
        const formattedDate = currentDate.toISOString().split('.')[0].replace('T', ' ');
        console.log(`Fetching tickets for date: ${formattedDate}`);
        
        const data = await authenticateAndFetchData(formattedDate);
        
        if (data.passes && data.passes.length > 0) {
            saveTicketsToFile(data, currentDate.toISOString().split('T')[0]);
            updateLatestTicketDate(data);
            console.log(`Fetch and save process completed for date: ${formattedDate}`);
        } else {
            console.log(`No new tickets found for date: ${formattedDate}`);
        }
        
        return data;
    } catch (error) {
        console.error(`Error during fetch and save process:`, error.message);
    }
}

function startPeriodicFetch() {
    console.log('Starting periodic fetch');
    setInterval(fetchAndSaveTickets, 20000); // Run every 20 seconds
}

app.get('/fetch', async (req, res) => {
    try {
        await fetchAndSaveTickets();
        res.send('Data has been fetched and saved.');
    } catch (error) {
        res.status(500).send('An error occurred while fetching data.');
    }
});

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
    startPeriodicFetch(); // Start the periodic fetch when the server starts
});
