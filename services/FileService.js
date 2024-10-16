const fs = require('fs');
const path = require('path');

class FileService {
    constructor(outputFolder) {
        this.outputFolder = outputFolder;
        this.ensureOutputFolderExists();
    }

    ensureOutputFolderExists() {
        if (!fs.existsSync(this.outputFolder)) {
            fs.mkdirSync(this.outputFolder, { recursive: true });
        }
    }

    getOutputFolder() {
        return this.outputFolder;
    }

    getFormattedTimestamp() {
        const now = new Date();
        return now.toISOString().replace(/[:T]/g, '-').slice(0, -5);
    }

    getTimestampedFilename(prefix, eventId = null) {
        const timestamp = this.getFormattedTimestamp();
        return eventId ? `${prefix}_${eventId}_${timestamp}.xml` : `${prefix}_${timestamp}.xml`;
    }

    saveToFile(data, filename) {
        const filePath = path.join(this.outputFolder, filename);
        fs.writeFileSync(filePath, data);
        console.log(`Data saved to file: ${filePath}`);
    }
}

module.exports = FileService;
