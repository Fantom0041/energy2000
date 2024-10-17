const axios = require('axios');
const xml2js = require('xml2js');

class EventService {
    constructor(configService, authService, fileService) {
        this.configService = configService;
        this.authService = authService;
        this.fileService = fileService;
        this.eventList = [];
    }

    async fetchEventList() {
        console.log('Fetching event list...');
        try {
            const url = new URL('/service.php/repertoire/list.xml', this.configService.get('ENDPOINTURL'));
            url.searchParams.append('symfony', this.authService.getSessionToken());

            const response = await axios.get(url.toString(), {
                headers: this.getHeaders()
            });

            const filename = this.fileService.getTimestampedFilename('response_getrepertoire');
            
            if (this.configService.outputFormat === 'json') {
                const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
                const jsonData = await parser.parseStringPromise(response.data);
                this.fileService.saveToFile(JSON.stringify(jsonData, null, 2), filename);
            } else {
                this.fileService.saveToFile(response.data, filename);
            }

            const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
            return await parser.parseStringPromise(response.data);
        } catch (error) {
            console.error('Error fetching event list:', error.message);
            throw error;
        }
    }

    async updateEventList() {
        console.log('Updating event list');
        try {
            await this.authService.login();
            const fetchedEventList = await this.fetchEventList();

            if (!fetchedEventList || !fetchedEventList.repertoires || !fetchedEventList.repertoires.repertoire) {
                console.error('No events found in the response');
                return;
            }

            this.eventList = Array.isArray(fetchedEventList.repertoires.repertoire) 
                ? fetchedEventList.repertoires.repertoire 
                : [fetchedEventList.repertoires.repertoire];

            console.log(`Updated event list. Found ${this.eventList.length} events`);
        } catch (error) {
            console.error('Error updating event list:', error.message);
        }
    }

    getEventList() {
        return this.eventList;
    }

    getHeaders() {
        return {
            'Cookie': `PHPSESSID=${this.authService.getSessionToken()}; symfony=${this.authService.getSessionToken()}`,
            'Accept': 'application/xml',
            'User-Agent': 'YourAppName/1.0',
        };
    }
}

module.exports = EventService;
