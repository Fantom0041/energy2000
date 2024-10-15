require('dotenv').config();
const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 3000;


const url = `https://domena klubu/service.php/api_omomo/Passes.json?date=2021-05-01`
const outputFolder = 'json';
const interval = 5000;

async function fetchData(date) {
    try {
        const response = await axios.get(url);
        const xmlData = response.data;
        const jsonData = await xml2js.parseStringPromise(xmlData);
        return jsonData;
    } catch (error) {
        console.error("Błąd podczas pobierania danych: ", error);
        throw error;
    }
}

function saveTicketsToFile(jsonData, date) {
    // const outputFolder = process.env.OUTPUT_FOLDER;
    // const outputFolder = 'json';
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }
    const filename = `tickets_${date}.json`;
    const filePath = path.join(outputFolder, filename);
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
    console.log(`Dane zapisane do pliku ${filePath}`);
}

async function fetchAndSaveTickets() {
    const today = new Date().toISOString().split('T')[0];
    try {
        const data = await fetchData(today);
        saveTicketsToFile(data, today);
    } catch (error) {
        console.error("Błąd podczas pobierania i zapisywania biletów: ", error);
    }
}

// cron.schedule(process.env.FETCH_INTERVAL, fetchAndSaveTickets);
cron.schedule(interval, fetchAndSaveTickets);

app.get('/fetch', async (req, res) => {
    try {
        await fetchAndSaveTickets();
        res.send('Dane zostały pobrane i zapisane.');
    } catch (error) {
        res.status(500).send('Wystąpił błąd podczas pobierania danych.');
    }
});

app.listen(port, () => {
    console.log(`Serwer nasłuchuje na porcie ${port}`);
});

fetchAndSaveTickets();
