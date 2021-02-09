"use strict";
// Stores data related to text processing (search queries, filters etc.)
/**
 * TODO: This solution is a kludge, requires rework
 * Probably should store all data as JSON, loader should parse and choose which keys to export based on config
 */

// Constant
const specialSourcesFilePath = "./resources/special_sources.json";

// Order of columns in input .csv file. Default schema is set in config.json
const dataSchemas = {
  "whatsAppSchema": {
    "chatName": 0,
    "datetime": 1,
    "type": 2,
    "phoneNumber": 3,
    "username": 4,
    "text": 5,
    "lemmatizedText": 6,
    "duplicateCount": 7,
  },
  "wordFrequencySchema": ["word", "freq", "power"],
  "compareDupl": ["messagePart", "duplNotInSpecial", "duplInSpecial"],
};

// Search queries for data. Must be RegEx objects
// "uis" flags are recommended
// Queries are stored locally
const { regExQueries } = require("./resources/regex_queries");

// A list of special sources (string format)
// Due to large size data "specialSources" is loaded from an external file below. File is stored locally
const specialSources = {};

// Loading data for "specialSources"
const fs = require("fs");
try {
  Object.assign(specialSources, JSON.parse(fs.readFileSync(specialSourcesFilePath)));
} catch (e) {
  console.error(`At helper_data.js: Got an error trying to read or parse the file: ${specialSourcesFilePath}.
${e.stack}
Terminating program.`);
  process.exit();
}

// A list of suffixes for outputs
const outputSuffixes = {
  "url": [
    "inlineUrlChat", "inlineUrlNotChat", "imageLinks", "videoLinks",
  ],
  "freq": [
    "totalFreq",
  ],
  "filter": [
    "main", "noSpecial", "onlySpecial", "adj", "mainFreq", "noSpecialFreq",
  ],
  "compare-dupl": [
    "compareDupl",
  ],
  "x-most-duples": [
    "MostDuples",
  ],
  "exclude-spam": [
    "noSpam",
  ],
  "field-and-values": [
    "ByValues",
  ],
};

// Spam words
const spamWords = {
  "wordFrequency": [
    "https", "группа", "ссылка", "com",
  ],
  "excludeSpam": {},
};
// Due to large size data "specialSources" is loaded from an external file below. File is stored locally
spamWords.excludeSpam = require("./resources/spam_words");

// Exporting
exports.dataSchemas = dataSchemas;
exports.regExQueries = regExQueries;
exports.specialSources = specialSources;
exports.outputSuffixes = outputSuffixes;
exports.spamWords = spamWords;
