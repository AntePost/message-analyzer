"use strict";
// Main body of program

// 3rd-party modules
const argv = require("minimist")(process.argv.slice(2), { "boolean": "lemm" });

// Resources
const { dataSchemas, regExQueries, outputSuffixes } = require("./resources");
const columnOrder = dataSchemas.whatsAppSchema;
const spamWordPartsForFrequency = require("./resources").spamWords.wordFrequency;
const dataForExtraction = require("./resources").specialSources.dataForExtraction;

// Helper functions
const {
  readJSONFile,
  getInputFilename,
  parseCsv,
  extractUrls,
  outputData,
  getWordFrequency,
  filterFrequecyArr,
  sortByChatNameThenByDate,
  countDuplicates,
  createAdjAndFiltered,
  isInSpecialSources,
  filterUniqueMessages,
  compareDuplicatesBySpecialSources,
  filterMostPopMessFromXUniqueAuthors,
  excludeSpam,
  getMedian,
  filterByMessageType,
  hasValueFromArray,
  extractUrlsFromRecord,
} = require("./functions");

// Constants
const configPath = "./config.json";

/**
 * Main funcion
 * 
 * @returns {undefined}
 */
const main = async () => {
  console.log("Starting");

  // Load config
  const config = await readJSONFile(configPath);

  // Parse -i flag
  const inputPath = argv.i;
  let inputFilenameWithoutExtention;
  if (inputPath) {
    inputFilenameWithoutExtention = getInputFilename(inputPath, config.inputFileExtention, false);
  } else {
    console.error("Provide value for -i argument");
    process.exit();
  }

  // Output method
  const outputMethod = argv.o ? argv.o : config.defaultOutputMethod;

  // Prepare folder name for output
  const folderName = inputFilenameWithoutExtention.slice(0, config.defaultFolderNameLength);

  // Check lemmatization setting
  let isLemmatized = argv.lemm ? argv.lemm : config.defaultLemmatization;

  // If lemmatized, modify column order and output suffixes
  // TODO: changing column order is a kludge, requires rework
  if (!isLemmatized) {
    delete columnOrder.lemmatizedText;
    columnOrder.duplicateCount--;

    outputSuffixes.filter = outputSuffixes.filter.slice(0, outputSuffixes.filter.length - 2);
  }

  // Parse data to analyze
  console.log("Parsing input file");
  const parsedCsv = await parseCsv(inputPath);
  console.log("Input file has been parsed");

  // Choosing what to do
  switch (argv.t) {
    // Parses URLs from texts
    case "url": {
      const extractedUrls = extractUrls(parsedCsv);
      outputData(outputMethod, extractedUrls, inputFilenameWithoutExtention, folderName, outputSuffixes.url, dataSchemas.wordFrequencySchema, "url");
      break;
    }
    // Calculates word frequency in parsed data
    case "freq": {
      if (!isLemmatized) {
        console.error("This operation requires lemmatized texts. Terminating");
        process.exit();
      }

      const wordFrequencyArr = filterFrequecyArr(getWordFrequency(parsedCsv), spamWordPartsForFrequency);
      outputData(outputMethod, [wordFrequencyArr], inputFilenameWithoutExtention, folderName, outputSuffixes.freq, dataSchemas.wordFrequencySchema, outputSuffixes.freq);
      break;
    }
    // Complex filtering of data by queries and output in specific format
    case "filter": {
      // Choosing which query to use and checking its validity
      const queryFromParameter = argv.q;
      if (queryFromParameter && !Object.prototype.hasOwnProperty.call(regExQueries, queryFromParameter)) {
        console.error("Unrecognized value for -q argument. Consult regex_queries.js for possible values");
        process.exit();
      }
      if (!queryFromParameter) {
        console.log("No value for -q argument has been provided. All queries will be performed");
      }

      // Sorting array by chat name first then by date
      parsedCsv.sort(sortByChatNameThenByDate);

      // Counting duplicate messages
      const duplicatesCount = countDuplicates(parsedCsv, columnOrder.text);

      // A loop for iterating over queries
      const queriesToUse = queryFromParameter ? { [queryFromParameter]: regExQueries[queryFromParameter] } : regExQueries;
      for (const key in queriesToUse) {
        console.log(`Starting query ${key}`);

        const [chatsWithAdjRows, filteredChats] = createAdjAndFiltered(parsedCsv, queriesToUse[key]);
        console.log("Finished adjacent");

        // Deep copy because elements were copied by reference from parsedCsv, and elements in filteredChatsCopy will be mutated
        const filteredChatsCopy = JSON.parse(JSON.stringify(filteredChats));
        console.log("Finished main");

        // Filter found matches into special sources and not
        const [notSpecialSourcesArr, specialSourcesArr] = JSON.parse(JSON.stringify(filteredChats.reduce((acc, cur) => {
          if (!isInSpecialSources(cur)) {
            acc[0].push(cur);
          } else {
            acc[1].push(cur);
          }
          return acc;
        }, [[], []])));
        console.log("Finished special/nonSpecial");

        // Count duplicates for special/nonSpecial and assing them to arrays
        filteredChatsCopy.map(el => el.push(duplicatesCount[el[columnOrder.text]]));
        const duplicatesCountNonSpecial = countDuplicates(notSpecialSourcesArr, columnOrder.text);
        const duplicatesCountSpecial = countDuplicates(specialSourcesArr, columnOrder.text);
        notSpecialSourcesArr.map(el => el.push(duplicatesCountNonSpecial[el[columnOrder.text]]));
        specialSourcesArr.map(el => el.push(duplicatesCountSpecial[el[columnOrder.text]]));

        // Leave only unique messages in notSpecialSourcesArr
        const notSpecialSourcesArrUnique = filterUniqueMessages(notSpecialSourcesArr);

        // Get word frequencies for filteredChatsCopy and notSpecialSourcesArr
        let mainFrequency, notSpecialUniqueFrequency;
        if (isLemmatized) {
          mainFrequency = filterFrequecyArr(getWordFrequency(filteredChatsCopy), spamWordPartsForFrequency);
          notSpecialUniqueFrequency = filterFrequecyArr(getWordFrequency(notSpecialSourcesArr), spamWordPartsForFrequency);
          console.log("Finished freq");
        }

        const resultingData = [
          filteredChatsCopy, notSpecialSourcesArrUnique, specialSourcesArr, chatsWithAdjRows,
        ];
        if (isLemmatized) {
          resultingData.push(mainFrequency, notSpecialUniqueFrequency);
        }

        outputData(outputMethod, resultingData, inputFilenameWithoutExtention, folderName, outputSuffixes.filter, Object.keys(columnOrder), key);
        console.log(`Query ${key} has been finished`);
      }
      break;
    }
    // Counts text strings by how often they match within and outside of special sources
    case "compare-dupl": {
      const result = compareDuplicatesBySpecialSources(parsedCsv);
      outputData(outputMethod, [result], inputFilenameWithoutExtention, folderName, outputSuffixes["compare-dupl"], dataSchemas.compareDupl, outputSuffixes["compare-dupl"]);
      break;
    }
    // Gets x most often repeated duplicates that are 10 of more words and only 1 message per user
    case "x-most-duples": {
      // Gets params
      const numOfRecordsToOutput = argv.x ? argv.x : config.defaultNumForMostDuplsOption;
      const byUrl = argv.u;

      // Prepares regEx
      const minNumOfWords = 10;
      const minNumOfWordsRegex = new RegExp(`(\\S+\\s+){${minNumOfWords - 1},}?\\S+`, "uis");

      // Filters only text messages with 10 or more words, counts duplicates
      const onlyChats = filterByMessageType(parsedCsv, "chat");
      let filtered;
      if (byUrl) {
        filtered = onlyChats.filter(el => extractUrlsFromRecord(el));
      } else {
        filtered = onlyChats.filter(el => minNumOfWordsRegex.test(el[columnOrder.text]));
      }
      const duplicatesCount = countDuplicates(filtered, columnOrder.text);
      filtered.map(el => el.push(duplicatesCount[el[columnOrder.text]]));

      const result = filterMostPopMessFromXUniqueAuthors(filtered, numOfRecordsToOutput);
      let suffixWithNumber = numOfRecordsToOutput.toString() + outputSuffixes["x-most-duples"];
      if (byUrl) {
        suffixWithNumber = suffixWithNumber.concat("ByUrl");
      }
      outputData(outputMethod, [result], inputFilenameWithoutExtention, folderName, [suffixWithNumber], Object.keys(columnOrder), suffixWithNumber);
      break;
    }
    // Filters AoA by a given field and an array of strings. Must be a complete match
    case "field-and-values": {
      // Check if a provided field is valid
      const field = argv.f;
      if (!Object.keys(columnOrder).includes(field)) {
        console.error("Unrecognized value for -f argument. Consult README.md for possible values");
        process.exit();
      }

      // TODO: think of a way to automatically choose a correct array of values. Currently it has to be done by altering code at the next line
      const result = parsedCsv.filter(el => hasValueFromArray(el, field, dataForExtraction.chatNames));

      const suffix = `${field}${outputSuffixes["field-and-values"]}`;
      outputData(outputMethod, [result], inputFilenameWithoutExtention, folderName, [suffix], Object.keys(columnOrder), suffix);
      break;
    }
    // Filters AoA by multiple criteria, outputs as .csv only
    case "exclude-spam": {
      if (argv.o) {
        console.log("Warning! This operation only outputs into .csv. -o flag will be ignored");
      }

      // Inline .filter excludes messages with a specified symbol from a non-Russian Cyrillic alphabet
      const withoutSpam = excludeSpam(parsedCsv).filter(el => !el[columnOrder.text].includes("ү"));

      const aggregateDataToDisplay = {
        "Initial size": parsedCsv.length,
        "Final size": withoutSpam.length,
        "Difference": parsedCsv.length - withoutSpam.length,
        // Calculates % of difference relative to parsedCsv.length, rounds to 2 places after radix
        "As a %": Math.round((parsedCsv.length - withoutSpam.length) / (parsedCsv.length / 100) * 100) / 100,
      };
      console.table(aggregateDataToDisplay);
      outputData("csv", [withoutSpam], inputFilenameWithoutExtention, folderName, outputSuffixes["exclude-spam"], dataSchemas.compareDupl, outputSuffixes["exclude-spam"], true);
      break;
    }
    // Cases below output result to console, not into a file
    // Determines earliest and latest message timestamps
    case "determ-dates": {
      const dateLimits = parsedCsv.reduce((acc, cur) => {
        const date = new Date(cur[columnOrder.datetime].slice(0, 10).split("/").reverse().join("-"));
        if (acc[0] < date) {
          acc[0] = date;
        }
        if (acc[1] > date) {
          acc[1] = date;
        }
        return acc;
      }, [new Date("1970-01-01"), new Date("9999-12-31")]);
      console.log(`Latest message at ${dateLimits[0].toLocaleDateString()}, earliest at ${dateLimits[1].toLocaleDateString()}`);
      break;
    }
    // Gathers metadata about the provided AoA
    case "meta": {
      const onlyChatNames = parsedCsv.map(el => el[columnOrder.chatName]);
      const uniqeChatNames = [...new Set(onlyChatNames)];
      const chatFreq = countDuplicates(parsedCsv, columnOrder.chatName);
      const chatMedian = getMedian(Object.values(chatFreq));

      const onlyPhoneNumbers = parsedCsv.map(el => el[columnOrder.phoneNumber]);
      const uniqePhoneNumbers = [...new Set(onlyPhoneNumbers)];
      const phoneNumbersFreq = countDuplicates(parsedCsv, columnOrder.phoneNumber);
      const phoneNumbersMedian = getMedian(Object.values(phoneNumbersFreq));

      console.log("Total number of messages:", parsedCsv.length);
      console.log("Total number of chats:", uniqeChatNames.length);
      console.log("Average number of messages per chat:", Math.round(parsedCsv.length / uniqeChatNames.length));
      console.log("Median number of messages per chat:", chatMedian);
      console.log("Average number of messages per user:", Math.round(parsedCsv.length / uniqePhoneNumbers.length));
      console.log("Median number of messages per user:", phoneNumbersMedian);
      console.log("Total number of text messages:", filterByMessageType(parsedCsv, "chat").length);
      break;
    }
    // Handles unrecognized -t parameters
    default: {
      console.error("Unrecognized value for -t argument. Consult README.md for possible values");
      process.exit();
    }
  }
};

main();
