const axios = require('axios');
const xml2js = require('xml2js');

class TicketService {
    constructor(configService, authService, fileService) {
        this.configService = configService;
        this.authService = authService;
        this.fileService = fileService;
    }

    async fetchTicketsForEvent(eventId) {
        console.log(`Fetching tickets for event ${eventId}`);
        try {
            const url = new URL(`/service.php/usher/${eventId}/synchronize.xml`, this.configService.get('ENDPOINTURL'));
            url.searchParams.append('symfony', this.authService.getSessionToken());

            const response = await axios.get(url.toString(), {
                headers: this.getHeaders()
            });

            const filename = this.fileService.getTimestampedFilename('response_tickets_event', eventId);
            this.fileService.saveToFile(response.data, filename);

            const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
            return await parser.parseStringPromise(response.data);
        } catch (error) {
            console.error(`Error fetching tickets for event ${eventId}:`, error.message);
            throw error;
        }
    }

    async fetchTicketsForAllEvents(eventList) {
        console.log('Starting fetch tickets process for all events');
        try {
            for (const event of eventList) {
                console.log(`Processing event: ${event.id}`);
                
                const ticketData = await this.fetchTicketsForEvent(event.id);
                
                if (ticketData && ticketData.synchronize && ticketData.synchronize.ticket) {
                    const tickets = Array.isArray(ticketData.synchronize.ticket) 
                        ? ticketData.synchronize.ticket 
                        : [ticketData.synchronize.ticket];
                    
                    console.log(`Found ${tickets.length} tickets for event: ${event.id}`);
                    
                    this.saveTicketsToFile(tickets, event.id);
                } else {
                    console.log(`No tickets found for event: ${event.id}`);
                }
            }
        } catch (error) {
            console.error(`Error during fetch tickets process:`, error.message);
        }
    }

    saveTicketsToFile(tickets, eventId) {
        const filename = `event_${eventId}_tickets_${this.fileService.getFormattedTimestamp()}.json`;
        this.fileService.saveToFile(JSON.stringify(tickets, null, 2), filename);
    }

    getHeaders() {
        return {
            'Cookie': `PHPSESSID=${this.authService.getSessionToken()}; symfony=${this.authService.getSessionToken()}`,
            'Accept': 'application/xml',
            'User-Agent': 'YourAppName/1.0',
        };
    }
}

module.exports = TicketService;
