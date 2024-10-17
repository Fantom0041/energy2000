const fs = require('fs');
const ini = require('ini');

class ConfigService {
    constructor(configPath) {
        this.config = ini.parse(fs.readFileSync(configPath, 'utf-8'));
        console.log('Configuration loaded from', configPath);
    }

    get(key, defaultValue) {
        return this.config[key] || defaultValue;
    }

    // Add this new getter method
    get outputFormat() {
        return this.get('OUTPUT_FORMAT', 'json');
    }
}

module.exports = ConfigService;
