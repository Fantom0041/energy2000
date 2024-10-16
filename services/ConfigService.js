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
}

module.exports = ConfigService;
