const xml2js = require('xml2js');

class JsonConverterService {
    constructor() {
        this.parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    }

    async xmlToJson(xmlData) {
        try {
            return await this.parser.parseStringPromise(xmlData);
        } catch (error) {
            console.error('Error converting XML to JSON:', error.message);
            throw error;
        }
    }

    jsonToXml(jsonData) {
        const builder = new xml2js.Builder();
        try {
            return builder.buildObject(jsonData);
        } catch (error) {
            console.error('Error converting JSON to XML:', error.message);
            throw error;
        }
    }
}

module.exports = JsonConverterService;
