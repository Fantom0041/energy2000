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
        
        // Save the raw XML response
        fs.writeFileSync('response_login.xml', response.data);
        console.log('Login response saved to response_login.xml');
        
        // Parse the XML response
        const parsedResponse = await xml2js.parseStringPromise(response.data);
        
        // Extract the session token from the parsed response
        const sessionToken = parsedResponse.logged.session[0];
        
        if (!sessionToken) {
            throw new Error('Session token not found in the response');
        }
        
        console.log(`SESSION ${sessionToken}`);
        
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

function saveTicketsToFile(tickets, filename) {
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }
    const filePath = path.join(outputFolder, `${filename}.json`);
    fs.writeFileSync(filePath, JSON.stringify(tickets, null, 2), 'utf-8');
    console.log(`Tickets saved to file: ${filePath}`);
}

function updateLatestTicketDate(tickets) {
    const ticketDates = tickets.map(ticket => new Date(ticket.date));
    const maxDate = new Date(Math.max.apply(null, ticketDates));
    if (!latestTicketDate || maxDate > latestTicketDate) {
        latestTicketDate = maxDate;
        console.log(`Latest ticket date updated to: ${latestTicketDate.toISOString()}`);
    }
}

async function fetchEventList(sessionToken) {
    console.log('Fetching event list...');
    try {
        const url = new URL('/service.php/repertoire/list.xml', config.ENDPOINTURL);
        url.searchParams.append('symfony', sessionToken);

        const response = await axios.get(url.toString(), {
            headers: {
                'Cookie': `PHPSESSID=${sessionToken}; symfony=${sessionToken}`,
                'Accept': 'application/xml',
                'User-Agent': 'YourAppName/1.0',
            }
        });

        fs.writeFileSync('response_getrepertoire.xml', response.data);
        console.log('Event list response saved to response_getrepertoire.xml');

        // Parse XML to JSON
        const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
        const result = await parser.parseStringPromise(response.data);
        
        // Log the parsed result for debugging
        console.log('Parsed event list:', JSON.stringify(result, null, 2));
        
        return result;
    } catch (error) {
        console.error('Error fetching event list:', error.message);
        throw error;
    }
}

async function fetchTicketsForEvent(sessionToken, eventId) {
    console.log(`Fetching tickets for event ${eventId}`);
    try {
        const url = new URL(`/service.php/usher/${eventId}/synchronize.xml`, config.ENDPOINTURL);
        url.searchParams.append('symfony', sessionToken);

        const response = await axios.get(url.toString(), {
            headers: {
                'Cookie': `PHPSESSID=${sessionToken}; symfony=${sessionToken}`,
                'Accept': 'application/xml',
                'User-Agent': 'YourAppName/1.0',
            }
        });

        // Save raw XML response
        fs.writeFileSync(`response_tickets_event_${eventId}.xml`, response.data);
        console.log(`Tickets for event ${eventId} saved to response_tickets_event_${eventId}.xml`);

        // Parse XML to JSON
        const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
        const result = await parser.parseStringPromise(response.data);
        return result;
    } catch (error) {
        console.error(`Error fetching tickets for event in sync  ${eventId}:`, error.message);
        throw error;
    }
}

async function fetchAndSaveTickets() {
    console.log('Starting fetch and save process');
    try {
        const sessionToken = await login();
        const eventList = await fetchEventList(sessionToken);

        if (!eventList || !eventList.repertoire || !eventList.repertoire.event) {
            console.error('No events found in the response');
            return;
        }

        const events = Array.isArray(eventList.repertoire.event) 
            ? eventList.repertoire.event 
            : [eventList.repertoire.event];

        console.log(`Found ${events.length} events`);

        // Process each event
        for (const event of events) {
            console.log(`Processing event: ${event.name} (ID: ${event.id})`);
            
            const ticketData = await fetchTicketsForEvent(sessionToken, event.id);
            
            if (ticketData && ticketData.synchronize && ticketData.synchronize.ticket) {
                const tickets = Array.isArray(ticketData.synchronize.ticket) 
                    ? ticketData.synchronize.ticket 
                    : [ticketData.synchronize.ticket];
                
                console.log(`Found ${tickets.length} tickets for event: ${event.name}`);
                
                // Save processed ticket data
                saveTicketsToFile(tickets, `event_${event.id}_${new Date().toISOString().split('T')[0]}`);
                
                // Update latest ticket date if necessary
                updateLatestTicketDate(tickets);
            } else {
                console.log(`No tickets found for event: ${event.name}`);
            }
        }
    } catch (error) {
        console.error(`Error during fetch and save process:`, error.message);
    }
}

function startPeriodicFetch() {
    console.log('Starting periodic fetch');
    const intervalSeconds = config.FETCH_INTERVAL_SECONDS || 3600; // Default to 1 hour if not specified
    console.log(`Fetch interval set to ${intervalSeconds} seconds`);
    setInterval(fetchAndSaveTickets, intervalSeconds * 1000);
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
