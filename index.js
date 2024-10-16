require('dotenv').config();
const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const ini = require('ini');
const querystring = require('querystring');

// Read configuration from visualtk.ini
const config = ini.parse(fs.readFileSync('./visualtk.ini', 'utf-8'));
console.log('Configuration loaded from visualtk.ini');

const app = express();
const port = process.env.PORT || 3001;

// const outputFolder = '/tmp/vnintegration';
const outputFolder = 'json';
const interval = '*/5 * * * *'; // Run every 5 minutes
let latestTicketDate = null;
let eventList = [];

// Ensure the output folder exists
if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
}

let sessionToken = null;

function getFormattedTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function getTimestampedFilename(prefix, eventId = null) {
    const timestamp = getFormattedTimestamp();
    if (eventId !== null) {
        return `${prefix}_${eventId}_${timestamp}.xml`;
    }
    return `${prefix}_${timestamp}.xml`;
}

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
        fs.writeFileSync(path.join(outputFolder, 'response_login.xml'), response.data);
        console.log('Login response saved to response_login.xml');
        
        // Parse the XML response
        const parsedResponse = await xml2js.parseStringPromise(response.data);
        
        // Extract the session token from the parsed response
        sessionToken = parsedResponse.logged.session[0];
        
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

function saveTicketsToFile(tickets, eventId) {
    const timestamp = getFormattedTimestamp();
    const filename = `event_${eventId}_tickets_${timestamp}.json`;
    const filePath = path.join(outputFolder, filename);
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

async function fetchEventList() {
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

        // Save raw XML response with timestamp
        const filename = getTimestampedFilename('response_getrepertoire');
        fs.writeFileSync(path.join(outputFolder, filename), response.data);
        console.log(`Event list response saved to ${filename}`);

        // Parse XML to JSON
        const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
        const result = await parser.parseStringPromise(response.data);
        
        return result;
    } catch (error) {
        console.error('Error fetching event list:', error.message);
        throw error;
    }
}

async function fetchTicketsForEvent(eventId) {
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

        // Save raw XML response with timestamp
        const filename = getTimestampedFilename('response_tickets_event', eventId);
        fs.writeFileSync(path.join(outputFolder, filename), response.data);
        console.log(`Tickets for event ${eventId} saved to ${filename}`);

        // Parse XML to JSON
        const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
        const result = await parser.parseStringPromise(response.data);
        return result;
    } catch (error) {
        console.error(`Error fetching tickets for event ${eventId}:`, error.message);
        throw error;
    }
}

async function updateEventList() {
    console.log('Updating event list');
    try {
        await login(); // Ensure we have a valid session token
        const fetchedEventList = await fetchEventList();

        if (!fetchedEventList || !fetchedEventList.repertoires || !fetchedEventList.repertoires.repertoire) {
            console.error('No events found in the response');
            return;
        }

        eventList = Array.isArray(fetchedEventList.repertoires.repertoire) 
            ? fetchedEventList.repertoires.repertoire 
            : [fetchedEventList.repertoires.repertoire];

        console.log(`Updated event list. Found ${eventList.length} events`);
        
        // Immediately fetch tickets for all events after updating the list
        await fetchTicketsForAllEvents();
    } catch (error) {
        console.error('Error updating event list:', error.message);
    }
}

async function fetchTicketsForAllEvents() {
    console.log('Starting fetch tickets process for all events');
    try {
        for (const event of eventList) {
            console.log(`Processing event: ${event.id}`);
            
            const ticketData = await fetchTicketsForEvent(event.id);
            
            if (ticketData && ticketData.synchronize && ticketData.synchronize.ticket) {
                const tickets = Array.isArray(ticketData.synchronize.ticket) 
                    ? ticketData.synchronize.ticket 
                    : [ticketData.synchronize.ticket];
                
                console.log(`Found ${tickets.length} tickets for event: ${event.id}`);
                
                saveTicketsToFile(tickets, event.id);
            } else {
                console.log(`No tickets found for event: ${event.id}`);
            }
        }
    } catch (error) {
        console.error(`Error during fetch tickets process:`, error.message);
    }
}

function startPeriodicEventListUpdate() {
    console.log('Starting periodic event list update');
    const intervalHours = config.EVENT_LIST_UPDATE_INTERVAL_HOURS || 6;
    const intervalMs = intervalHours * 60 * 60 * 1000;
    console.log(`Event list update interval set to ${intervalHours} hours`);
    setInterval(updateEventList, intervalMs);
    updateEventList(); // Run immediately on start
}

function startPeriodicTicketFetch() {
    console.log('Starting periodic ticket fetch');
    const intervalSeconds = config.TICKET_FETCH_INTERVAL_SECONDS || 60;
    console.log(`Ticket fetch interval set to ${intervalSeconds} seconds`);
    setInterval(fetchTicketsForAllEvents, intervalSeconds * 1000);
}

app.get('/fetch-events', async (req, res) => {
    try {
        await updateEventList();
        res.send('Event list has been updated.');
    } catch (error) {
        res.status(500).send('An error occurred while updating the event list.');
    }
});

app.get('/fetch-tickets', async (req, res) => {
    try {
        await fetchTicketsForAllEvents();
        res.send('Tickets have been fetched and saved for all events.');
    } catch (error) {
        res.status(500).send('An error occurred while fetching tickets.');
    }
});

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
    console.log(`Output folder set to: ${outputFolder}`);
    startPeriodicEventListUpdate();
    startPeriodicTicketFetch();
});
