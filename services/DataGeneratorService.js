const fs = require('fs');
const path = require('path');

class DataGeneratorService {
    constructor(fileService) {
        this.fileService = fileService;
    }

    generateConnectedData() {
        const timestamp = this.fileService.getFormattedTimestamp();
        const repertoireData = this.generateRepertoireData(timestamp);
        const repertoireFilename = `response_getrepertoire_${timestamp}.json`;
        this.fileService.saveToFile(JSON.stringify(repertoireData, null, 2), repertoireFilename);

        const ticketsFilenames = [];
        repertoireData.repertoires.repertoire.forEach(event => {
            const ticketsData = this.generateTicketsData(event.id, timestamp);
            const ticketsFilename = `response_tickets_event_${event.id}_${timestamp}.json`;
            this.fileService.saveToFile(JSON.stringify(ticketsData, null, 2), ticketsFilename);
            ticketsFilenames.push(ticketsFilename);
        });

        return { repertoireFilename, ticketsFilenames };
    }

    generateRepertoireData(timestamp) {
        const eventCount = Math.floor(Math.random() * 5) + 1; // Generate 1 to 5 events
        const events = [];

        for (let i = 0; i < eventCount; i++) {
            const eventId = Math.floor(Math.random() * 1000) + 600;
            const eventDate = new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000);

            events.push({
                id: eventId.toString(),
                tickets: Math.floor(Math.random() * 200).toString(),
                date_of_distribution: eventDate.toLocaleDateString('pl-PL'),
                date_of_distribution_timestamp: Math.floor(eventDate.getTime() / 1000).toString(),
                location_id: "2",
                external: "",
                nb_of_entry: "0",
                free: Math.floor(Math.random() * 3000).toString(),
                type: "1",
                date: eventDate.toLocaleString('pl-PL'),
                timestamp: Math.floor(eventDate.getTime() / 1000).toString(),
                updated: Math.floor(Date.now() / 1000).toString(),
                details: "",
                products: {
                    product: [
                        {
                            id: (Math.floor(Math.random() * 100) + 200).toString(),
                            price: (Math.random() * 100).toFixed(2).replace('.', ','),
                            available_for_pass: "false",
                            for_pass: "false",
                            available: Math.floor(Math.random() * 500).toString()
                        }
                    ]
                }
            });
        }

        return {
            repertoires: {
                number: events.length.toString(),
                page: "1",
                nbofpages: "1",
                from: "1",
                to: events.length.toString(),
                repertoire: events
            }
        };
    }

    generateTicketsData(eventId, timestamp) {
        const ticketCount = Math.floor(Math.random() * 30) + 10;
        const tickets = [];

        for (let i = 0; i < ticketCount; i++) {
            tickets.push({
                name: `Ticket ${i + 1}`,
                price: (Math.random() * 100).toFixed(2).replace('.', ','),
                entry: "0",
                entry_time: "",
                pass: "",
                ticket: (4000000000000 + Math.floor(Math.random() * 1000000)).toString(),
                out: "0",
                out_time: ""
            });
        }

        return {
            synchronize: {
                entry_count: "0",
                repertoire_id: eventId.toString(),
                date: new Date().toLocaleString('pl-PL'),
                element: tickets
            }
        };
    }
}

module.exports = DataGeneratorService;
