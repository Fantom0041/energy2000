require('dotenv').config();
const express = require('express');
const ConfigService = require('./services/ConfigService');
const AuthService = require('./services/AuthService');
const EventService = require('./services/EventService');
const TicketService = require('./services/TicketService');
const FileService = require('./services/FileService');
const SchedulerService = require('./services/SchedulerService');
// const DataGeneratorService = require('./services/DataGeneratorService');

const app = express();


// Initialize services
const configService = new ConfigService('./visualtk.ini');

const fileService = new FileService(
    configService,
    configService.get('OUTPUT_DIR', '/tmp/vnintegration/')
);

const authService = new AuthService(configService, fileService);
const eventService = new EventService(configService, authService, fileService);
const ticketService = new TicketService(configService, authService, fileService);
const schedulerService = new SchedulerService(configService, eventService, ticketService);

const port = configService.get('PORT', '5000');

app.get('/fetch-events', async (req, res) => {
    try {
        await eventService.updateEventList();
        await ticketService.fetchTicketsForAllEvents(eventService.getEventList());
        res.send('Event list has been updated and tickets have been fetched.');
    } catch (error) {
        res.status(500).send('An error occurred while updating the event list and fetching tickets.');
    }
});

app.get('/fetch-tickets', async (req, res) => {
    try {
        await ticketService.fetchTicketsForAllEvents(eventService.getEventList());
        res.send('Tickets have been fetched and saved for all events.');
    } catch (error) {
        res.status(500).send('An error occurred while fetching tickets.');
    }
});

app.listen(port, async () => {
    console.log(`Server is listening on port ${port}`);
    console.log(`Output folder set to: ${fileService.getOutputFolder()}`);
    
    try {
        await eventService.updateEventList();
        await ticketService.fetchTicketsForAllEvents(eventService.getEventList());
        console.log('Initial data fetch completed');
    } catch (error) {
        console.error('Error during initial data fetch:', error.message);
    }

    schedulerService.startPeriodicUpdates();
});

// Generate connected data
// const dataGeneratorService = new DataGeneratorService(fileService);
// const { repertoireFilename, ticketsFilename } = dataGeneratorService.generateConnectedData();

// console.log(`Generated repertoire file: ${repertoireFilename}`);
// console.log(`Generated tickets file: ${ticketsFilename}`);
