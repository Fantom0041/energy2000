const fs = require('fs');
const xml2js = require('xml2js');

// Function to convert XML to JSON
function convertXmlToJson(xmlFilePath, jsonFilePath) {
    // Read the XML file
    fs.readFile(xmlFilePath, 'utf8', (err, xmlData) => {
        if (err) {
            console.error('Error reading XML file:', err);
            return;
        }

        // Parse XML to JSON
        const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
        parser.parseString(xmlData, (err, result) => {
            if (err) {
                console.error('Error parsing XML:', err);
                return;
            }

            // Convert JSON object to string
            const jsonString = JSON.stringify(result, null, 2);

            // Write JSON to file
            fs.writeFile(jsonFilePath, jsonString, 'utf8', (err) => {
                if (err) {
                    console.error('Error writing JSON file:', err);
                    return;
                }
                console.log(`Successfully converted ${xmlFilePath} to ${jsonFilePath}`);
            });
        });
    });
}

// Usage
const xmlFilePath = 'response_getrepertoire.xml';
const jsonFilePath = 'response_getrepertoire.json';

convertXmlToJson(xmlFilePath, jsonFilePath);
