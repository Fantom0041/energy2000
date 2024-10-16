const axios = require('axios');
const querystring = require('querystring');
const xml2js = require('xml2js');

class AuthService {
    constructor(configService, fileService) {
        this.configService = configService;
        this.fileService = fileService;
        this.sessionToken = null;
    }

    async login() {
        console.log('Attempting to log in...');
        try {
            const loginUrl = new URL('/service.php/home/login.xml', this.configService.get('ENDPOINTURL'));
            loginUrl.search = querystring.stringify({
                login: this.configService.get('USERNAME'),
                password: this.configService.get('USERPASS')
            });

            const response = await axios.get(loginUrl.toString());
            
            this.fileService.saveToFile(response.data, 'response_login.xml');
            
            const parsedResponse = await xml2js.parseStringPromise(response.data);
            this.sessionToken = parsedResponse.logged.session[0];
            
            if (!this.sessionToken) {
                throw new Error('Session token not found in the response');
            }
            
            console.log(`SESSION ${this.sessionToken}`);
            return this.sessionToken;
        } catch (error) {
            console.error('Error during login:', error.message);
            throw error;
        }
    }

    getSessionToken() {
        return this.sessionToken;
    }
}

module.exports = AuthService;
