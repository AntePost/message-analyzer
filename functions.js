"use strict";
// Various helper functions

// System modules
const fs = require("fs");
const fsPromises = require("fs").promises;

// 3rd-party modules
const parse = require("csv-parse");
const stringify = require("csv-stringify");
const XLSX = require("xlsx");

// Resources
const columnOrder = require("./resources").dataSchemas.whatsAppSchema;
const { standardSources, standardSourcesParts, standardSourcesParstForComparison } = require("./resources").specialSources;
const { spamChats, spamMessages, spamChatsParts, spamMessagesParts, spamPhoneNumbers, spamPhoneNumbersParts } = require("./resources").spamWords.excludeSpam;

// I/O functions

/**
 * Reads a parses a JSON file
 * 
 * @param {string} filePath
 * @returns {object} Parsed JSON as object
 */
const readJSONFile = async filePath => {
  let parsedData;
  try {
    const data = await fsPromises.readFile(filePath);
    parsedData = JSON.parse(data);
    return parsedData;
  } catch (e) {
    console.error(`readJSONFile(): Got an error trying to read or parse the file: ${filePath}.
${e.stack}
Terminating program.`);
    process.exit();
  }
};

/**
 * Extracts file name from path
 * 
 * @param {string} path Filepath in question
 * @param {string} extention File extention to look for (case-insensitive)
 * @param {boolean} withExtention Whether to return filename with extention, "true" by default
 * @returns {string} Filename in filepath
 */
const getInputFilename = (path, extention, withExtention = true) => {
  const regexPattern = `/?([^/]+)\\.${extention}$`;
  const regex = new RegExp(regexPattern, "iu");
  const matches = path.match(regex);
  if (matches) {
    return withExtention ? matches[0] : matches[1];
  } else {
    console.error("Can't find filename in -i argument value");
    process.exit();
  }
};

/**
 * Parses .csv file into an AoA
 * 
 * @param {string} filepath Path to a file
 * @returns {Promise} Parsed .csv as an AoA
 */
const parseCsv = filepath => {
  return new Promise((resolve, reject) => {
    fs.readFile(filepath, (err, data) => {
      if (err) reject(err);
      parse(data, { relax_column_count: true }, (err, output) => {
        if (err) reject(err);
        resolve(output);
      });
    });
  });
};

/**
 * Chooses which method to use for output data
 * 
 * @param {string} method Output method: "csv"|"xlsx"
 * @param {array} arrs A wrapper [] with AoA of resulting data
 * @param {string} inputFilename Input filename without extention to be used in output filename
 * @param {string} folderName Folder name to output files into
 * @param {array} suffixesArr An array of strings to be used in output filenames (csv) or sheet names (xlsx)
 * @param {array} schema An array of strings to be added as headers to the output file
 * @param {string} workbookSuffix A string to be used in output filename (xlsx)
 * @param {boolean} noHeaders Outputs file with no headers (schema), "false" by default. Only applies to .csv
 * @returns {undefined}
 */
const outputData = (method, arrs, inputFilename, folderName, suffixesArr, schema, workbookSuffix, noHeaders = false) => {
  const path = `./output/${folderName}`;
  prepareFolder(path);
  switch (method) {
    case "csv": {
      for (let i = 0; i < arrs.length; i++) {
        outputCsvFile(arrs[i], inputFilename, path, suffixesArr[i], schema, noHeaders);
      }
      break;
    }
    case "xlsx": {
      outputXlsxFile(arrs, inputFilename, path, suffixesArr, schema, workbookSuffix);
      break;
    }
    default:
      console.error("Unrecognized value for -o argument. Consult README.md for possible values");
      process.exit();
  }
};

/**
 * Checks if a folder at a given path exists at "./output/". If not, creates it
 * 
 * @param {string} path Folder path to check
 * @returns {undefined}
 * @todo Add check for whether an object at a given path is a directory
 */
const prepareFolder = path => {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
    console.log(`The folder ${path} has been created.`);
  }
};

/**
 * Outputs AoA as .csv
 * 
 * @param {array} arr An AoA to output as a file
 * @param {string} inputFilename Input filename without extention to be used in output filename
 * @param {string} path A path to save a file to
 * @param {string} outputSuffix A string to be used in output filename
 * @param {array} schema An array of strings to be added as headers to the output file
 *  * @param {boolean} noHeaders Outputs file with no headers (schema), "false" by default
 * @returns {undefined}
 */
const outputCsvFile = (arr, inputFilename, path, outputSuffix, schema, noHeaders = false) => {
  if (!noHeaders) {
    arr.unshift(schema);
  }

  stringify(arr, {
    quoted: true,
    quoted_empty: true,
  }, (err, output) => {
    if (err) throw err;
    const outputFilename = `${path}/${inputFilename}_${outputSuffix}.csv`;
    fs.writeFile(outputFilename, output, err => {
      if (err) throw err;
      console.log(`The file '${outputFilename}' has been saved!`);
    });
  });
};

/**
 * Converts an array of AoAs into Excel sheets, adds them to a workbook, outputs a workbook as a file
 * 
 * @param {array} arrs An array of AoAs to output
 * @param {string} inputFilename Input filename without extention to be used in output filename
 * @param {string} path A path to save a file to
 * @param {array} suffixesArr An array of strings to be used in sheet names
 * @param {array} schema An array of strings to be added as headers to the output file
 * @param {string} workbookSuffix A string to be used in output filename
 * @returns {undefined}
 */
const outputXlsxFile = (arrs, inputFilename, path, suffixesArr, schema, workbookSuffix) => {
  const workbook = XLSX.utils.book_new();
  for (let i = 0; i < arrs.length; i++) {
    arrs[i].unshift(schema);
    const sheet = XLSX.utils.aoa_to_sheet(arrs[i]);
    XLSX.utils.book_append_sheet(workbook, sheet, suffixesArr[i]);
  }
  const outputFilename = `${path}/${inputFilename}_${workbookSuffix}.xlsx`;
  try {
    XLSX.writeFile(workbook, outputFilename, { compression: true });
  } catch (e) {
    console.error(`outputXlsxFile(): Got an error trying to output the file: ${outputFilename}.
${e.stack}
Terminating program.`);
  }
  console.log(`The file '${outputFilename}' has been saved!`);
};

// Extracting functions

/**
 * Extracts all URLs from provided AoA
 * 
 * @param {array} parsedCsv Array of records
 * @param {bool} united Whether to return 4 separate arrays or 1 joined. Defaults to false
 * @returns {array} Array wrapper for 4 (or 1) subarrays with extracted data
 */
const extractUrls = (parsedCsv, united=false) => {
  const extractedIntextURLs = extractIntextUrls(filterByMessageType(parsedCsv, "chat"));
  const extractedImageLinks = extractField(filterByMessageType(parsedCsv, "image"), "text");
  const extractedVideoLinks = extractField(filterByMessageType(parsedCsv, "video"), "text");

  if (!united) {
    const urlFrequencyArr = convertToArr(countWordFrequencyAndPower(extractedIntextURLs));
    const [urlsOfChatsArr, urlsNotOfChatsArr] = extractUrlByType(urlFrequencyArr);

    const imageFrequencyArr = convertToArr(countWordFrequencyAndPower(extractedImageLinks));
    const videoFrequencyArr = convertToArr(countWordFrequencyAndPower(extractedVideoLinks));

    return [
      urlsOfChatsArr, urlsNotOfChatsArr, imageFrequencyArr, videoFrequencyArr,
    ];
  } else {
    const unitedArr = extractedIntextURLs.concat(extractedImageLinks, extractedVideoLinks);
    return [ convertToArr(countWordFrequencyAndPower(unitedArr)) ];
  }
};

/**
 * Extracts URLs from texts
 * 
 * @param {array} arr Array of records
 * @returns {array} Flat array of extracted URLs
 */
const extractIntextUrls = arr => {
  const extractedUrlsArr = arr.reduce((acc, cur) => {
    let matches = extractUrlsFromRecord(cur);
    if (matches) {
      acc = acc.concat(matches);
    }
    return acc;
  }, []);
  return extractedUrlsArr;
};

/**
 * Either extracts URLs from a record's text or tests its presence
 * 
 * @param {array} record Provided record
 * @param {bool} test Whether to extract URLs or test for them. Defaults to false
 * @returns {array|bool} Returs an array of matches if test param is false, otherwise returns a boolean indicating whether there are any URLs
 */
const extractUrlsFromRecord = (record, test=false) => {
  // As per https://www.regextester.com/94502
  const regex = /(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w.-]+)+[\w\-._~:/?#[\]@!$&'()*+,;=.]+/iug;
  if (!test) {
    let matches = record[columnOrder.text].match(regex);
    if (matches) {
      matches = matches.filter(el => !/^\d+\.+\d*$/.test(el));
      return matches;
    }
  } else {
    return regex.test(record[columnOrder.text]);
  }
};

/**
 * Filters array of URLs by whether they link is external or internal
 * 
 * @param {array} arr 
 * @returns {array} AoA: [internalUrlArr, externalUrlArr]
 */
const extractUrlByType = arr => {
  const internalAndExternalUrlArr = arr.reduce((acc, cur) => {
    /\/chat.whatsapp.com\//.test(cur) ? acc[0].push(cur) : acc[1].push(cur);
    return acc;
  }, [[], []]);
  return internalAndExternalUrlArr;
};

/**
 * Filters a frequency array by a provided list of spam word parts and excludes words with non-letters
 * 
 * @param {array} arr Frequency array to filter
 * @param {array} filterList An array of string to filter
 * @returns {array} Filtered array
 */
const filterFrequecyArr = (arr, filterList) => {
  const filteredArr = arr.filter(el => {
    if (filterList.includes(el[0])) {
      return false;
    }
    if (/\p{L}/ui.test(el[0])) {
      return true;
    }
    return false;
  });
  return filteredArr;
};

/**
 * Performs a series of checks to see if given row's specific field contains partial or complete match with any of the spam strings.
 * Returns all unmatched rows
 * 
 * @param {array} arr AoA to exclude spam from
 * @returns {array} Filtered AoA
 */
const excludeSpam = arr => {
  return JSON.parse(JSON.stringify(arr.filter(el => {
    if (spamChats.includes(el[columnOrder.chatName])) {
      return false;
    }
    if (hasValueFromArray(el, "chatName", spamChatsParts)) {
      return false;
    }
    if (spamMessages.includes(el[columnOrder.text])) {
      return false;
    }
    if (hasValueFromArray(el, "text", spamMessagesParts)) {
      return false;
    }
    if (spamPhoneNumbers.includes(el[columnOrder.phoneNumber])) {
      return false;
    }
    if (hasValueFromArray(el, "phoneNumber", spamPhoneNumbersParts)) {
      return false;
    }
    return true;
  })));
};

// Queries functions

/**
 * Filters AoA by query creating an AoA with adjacent rows (next to the match) and an AoA simply filtered by query
 * 
 * @param {array} arr An AoA to process
 * @param {RegExp} query A RegExp query to filter by
 * @returns {array} A wrapper for 2 AoAs: [chatsWithAdjRows, filteredChats]
 * @todo Think about decomposing this functions
 */
const createAdjAndFiltered = (arr, query) => {
  console.log(`Data to process length: ${arr.length}`);

  // Prepare variables
  let chatsWithAdjRows = [];
  let filteredChats = [];
  const adjacentSeparatorString = "---";
  const adjacentSeparator = Array(Object.keys(columnOrder).length).fill(adjacentSeparatorString);
  const numOfAdjRows = 5;
  const numOfAdjRowsBetweenMatches = 7;
  const keywordEmphasis = "Keyword found";

  // A loop to iterate over arr
  for (let i = 0; i < arr.length; i++) {
    // Testing if match
    if (isMatchByQuery(arr[i], query)) {
      // Push match into filteredChats
      filteredChats.push(arr[i]);
      // If match isn't in standard sources
      if (!isInSpecialSources(arr[i])) {
        // Get adjacent rows above
        chatsWithAdjRows.push(...getXAdjRows(arr, i, numOfAdjRows, "up"));
        // Push match into chatsWithAdjRows with note
        chatsWithAdjRows.push(arr[i].concat(keywordEmphasis));
        // Get adjacent rows below and additional information. var keyword is used because of block scope (see newCount)
        // downAdj: to be added to chatsWithAdjRows, foundNoAdjArr: to be added to filteredChats, newCount: to be used to skip iterations
        // See getDownAdj() docs for more info
        var [downAdj, foundNoAdjArr, newCount] = getDownAdj(arr, i, numOfAdjRows, numOfAdjRowsBetweenMatches, query, keywordEmphasis);
        // Add found data to AoAs
        filteredChats.push(...foundNoAdjArr);
        chatsWithAdjRows.push(...downAdj);
        // Separate blocks in chatsWithAdjRows
        chatsWithAdjRows.push(adjacentSeparator);
      }
    }

    // Skip requred number of iterations in the loop, log progress
    if (i < newCount) {
      for (let j = i; j <= newCount; j++) {
        if (j % 100000 === 0) {
          console.log(`${j} rows have been processed`);
        }
      }
      i = newCount;
    } else {
      if (i % 100000 === 0) {
        console.log(`${i} rows have been processed`);
      }
    }
  }
  return [chatsWithAdjRows, filteredChats];
};

/**
 * Gets x number of adjacent (in the same chat) rows. Requires arr to be sorted by date ascending
 * 
 * @param {array} arr An AoA to process
 * @param {number} i Current counter value
 * @param {number} x Number of adjacent rows to get
 * @param {string} direct Above or below rows to get: "up"|"down"
 * @returns {array} An AoA with adjacent rows
 */
const getXAdjRows = (arr, i, x, direct) => {
  // Prepare variables
  let foundCount = 0;
  let count = i + (direct === "up" ? -1 : 1);
  const chatName = arr[i][columnOrder.chatName];
  const foundArr = [];

  // Iterate over arr until x number of adjacent rows are found or arr ends
  while (foundCount < x) {
    if (count < 0 || count >= arr.length) {
      break;
    }
    const sameChat = arr[count][columnOrder.chatName] === chatName;
    if (sameChat) {
      foundArr.push(arr[count]);
      foundCount++;
    }
    direct === "up" ? count-- : count++;
  }

  // Reverse foundArr if above rows were requested
  return direct === "up" ? foundArr.reverse() : foundArr;
};

/**
 * Iterates over arr: finds new matches, also finds same chat rows for matches
 * Stops when next match isn't found within next (maxDistance + 1) elements
 * 
 * @param {array} arr An AoA to process
 * @param {number} j Current counter value
 * @param {number} x Number of adjacent rows to keep after last found match
 * @param {number} maxDistance Max number of adjacent row between matches (non-inclusive)
 * @param {RegExp} query A RegExp query to filter by
 * @param {string} keywordEmphasis A string to highlight rows with matches
 * @returns {array} Wrapper for [slicedFoundArr (matches with adjacent), foundNoAdjArr (matches without adjacent), count (updated counter value)]
 * @todo Passing keywordEmphasis is a kludge, need to refactor
 */
const getDownAdj = (arr, j, x, maxDistance, query, keywordEmphasis) => {
  // Prepare variables
  let countSinceLastMatch = 0;
  let count = j + 1;
  const chatName = arr[j][columnOrder.chatName];
  const foundArr = [];
  const foundNoAdjArr = [];

  // Iterate over arr until no new match is found for (maxDistance + 1) after last match or arr ends
  while (countSinceLastMatch < maxDistance + 1) {
    if (count >= arr.length) {
      count++;
      break;
    }

    const sameChat = arr[count][columnOrder.chatName] === chatName;
    if (sameChat) {
      foundArr.push(JSON.parse(JSON.stringify(arr[count])));
      countSinceLastMatch++;

      if (isMatchByQuery(arr[count], query) && !isInSpecialSources(arr[count])) {
        countSinceLastMatch = 0;
        foundArr[foundArr.length - 1].push(keywordEmphasis);
        foundNoAdjArr.push(arr[count]);
      }
    } else {
      count++;
      break;
    }

    count++;
  }
  // Keep x number of rows after last match
  const slicedFoundArr = countSinceLastMatch > x ? foundArr.slice(0, foundArr.length - (countSinceLastMatch - x)) : foundArr;
  return [slicedFoundArr, foundNoAdjArr, count - 1];
};

/**
 * Checks whether provided element's chat name is in special sources
 * 
 * @param {array} arrEl One element of AoA
 * @returns {boolean} true if provided element's chat name is in special sources
 */
const isInSpecialSources = arrEl => {
  return standardSources.includes(arrEl[columnOrder.chatName]) || standardSourcesParts.some(el => arrEl[columnOrder.chatName].includes(el));
};

/**
 * Check whether provided element's text contains regEx pattern
 * 
 * @param {array} arrEl One element of AoA
 * @param {RegExp} query A RegExp query to check with
 * @returns {boolean} true if provided element's text contains regEx pattern
 */
const isMatchByQuery = (arrEl, query) => {
  return query.test(arrEl[columnOrder.text].toLowerCase());
};

// Analytics functions

/**
 * Counts word frequency and "word power" in array of strings
 * "Word power" is the number of strings where a given word occurs
 * 
 * @param {array} arr Array of strings
 * @returns {object} Frequency object: key is "word", value is ["frequency", "word power"]
 */
const countWordFrequencyAndPower = arr => {
  const frequencyCount = {};
  arr.forEach(el => {
    el.split(" ").forEach(elInner => {
      if (!frequencyCount[elInner]) {
        frequencyCount[elInner] = [0, 0];
      }
      frequencyCount[elInner][0]++;
    });
    const uniqueWords = [...new Set(el.split(" "))];
    for (const word of uniqueWords) {
      frequencyCount[word][1]++;
    }
  });
  return frequencyCount;
};

/**
 * Calculates word frequency and word power of lemmatizedText column in provided AoA
 * 
 * @param {array} parsedCsv AoA with records
 * @returns {array} An AoA with frequency and word power data
 */
const getWordFrequency = parsedCsv => {
  const onlyChats = filterByMessageType(parsedCsv, "chat");
  const allLemmatizedTextsArr = onlyChats.map(el => el = el[columnOrder.lemmatizedText]);
  let frequncyObj = countWordFrequencyAndPower(allLemmatizedTextsArr);
  return convertToArr(frequncyObj);
};

/**
 * Counts duplicates within the specified field in the provided AoA
 * 
 * @param {array} arr An AoA to count duplicate text messages in
 * @param {number} field AoA inner elements' field number to count duplicates in
 * @returns {object} An object with messages as keys, number of duplicates as values
 * @todo See if $this and countWordFrequencyAndPower() can be refactored in one general function
 */
const countDuplicates = (arr, field) => {
  const duplicatesCount = {};
  arr.forEach(el => {
    if (!duplicatesCount[el[field]]) {
      duplicatesCount[el[field]] = 0;
    }
    duplicatesCount[el[field]]++;
  });
  return duplicatesCount;
};

/**
 * Iterates over an array of strings. Counts how many matches within special sources rows and outside of them
 * 
 * @param {array} arr An AoA of rows
 * @returns {array} An AoA: [part, countNotInSpecial, countInSpecial]
 */
const compareDuplicatesBySpecialSources = arr => {
  const result = [];
  for (const part of standardSourcesParstForComparison) {
    const foundMesages = arr.filter(el => el[columnOrder.text].includes(part));
    const notSpecialOrSpecialLengthArr = foundMesages.reduce((acc, cur) => {
      if (!isInSpecialSources(cur)) {
        acc[0]++;
      } else {
        acc[1]++;
      }
      return acc;
    }, [0, 0]);
    const countedPiece = [
      part, ...notSpecialOrSpecialLengthArr,
    ];
    result.push(countedPiece);
  }
  return result;
};

// Filtration by uniqueness functions

/**
 * Filters AoA leaving only rows with unique "text" column
 * 
 * @param {array} arr AoA to select unique messages from
 * @returns {array} Filtered AoA
 */
const filterUniqueMessages = arr => {
  const uniqueMessages = [];
  for (const row of arr) {
    if (uniqueMessages.findIndex(el => el[columnOrder.text] === row[columnOrder.text]) === -1) {
      uniqueMessages.push(row);
    }
  }
  return uniqueMessages;
};

/**
 * Filters only unique authors, takes the message with the most duplicates
 * 
 * @param {array} arr AoA to filter
 * @param {number} x Number of records to output
 * @returns {array} Filtered AoA
 */
const filterMostPopMessFromXUniqueAuthors = (arr, x) => {
  // Sorts AoA by duplicate count first, then alphabetically
  arr.sort((a, b) => {
    return b[columnOrder.duplicateCount] - a[columnOrder.duplicateCount] || a[columnOrder.text].localeCompare(b[columnOrder.text]);
  });

  const uniqueMessages = [];
  for (const row of arr) {
    if (uniqueMessages.findIndex(el => el[columnOrder.phoneNumber] === row[columnOrder.phoneNumber]) !== -1) {
      continue;
    }
    if (uniqueMessages.length === 0 || row[columnOrder.text] !== uniqueMessages[uniqueMessages.length - 1][columnOrder.text]) {
      uniqueMessages.push(row);
    }
    if (uniqueMessages.length === x) {
      break;
    }
  }
  return uniqueMessages;
};

// Helper functions

/**
 * Filters AoA by message type
 * 
 * @param {array} arr Array to filter
 * @param {string} type Type of message to filter by
 * @returns {array} Filtered array
 */
const filterByMessageType = (arr, type) => {
  return arr.filter(el => el[columnOrder.type] === type);
};

/**
 * Exctracts specified column from AoA
 * 
 * @param {array} arr Array to extract column from
 * @param {string} column Which column to extract
 * @returns {array} Flat array
 */
const extractField = (arr, column) => {
  return arr.map(el => el[columnOrder[column]]);
};

/**
 * Converts an object to array. Returns AoA where each element contains object's key and value. Sorted by value
 * 
 * @param {object} obj Object to convert to array
 * @returns {array} Converted array
 */
const convertToArr = obj => {
  const arr = Object.keys(obj).map(key => [key, ...obj[key]]);
  arr.sort((a, b) => b[1] - a[1]);
  return arr;
  // Old version
  /*   let arr;
    if (typeof obj[Symbol.iterator] === 'function') {
      arr = Object.keys(obj).map(key => [key, ...obj[key]]);
    } else {
      arr = Object.keys(obj).map(key => [key, obj[key]]);
    } */
};

/**
 * Compare function for .sort() array method. Sorts AoA by chatName first, then by date (ascending)
 * 
 * @param {array} a First element for comparison
 * @param {array} b Second element for comparison
 * @returns {array} Sorted array
 */
const sortByChatNameThenByDate = (a, b) => {
  let firtsDate = a[columnOrder.datetime].split(" ");
  firtsDate[0] = firtsDate[0].split("/").reverse().join("-");
  firtsDate = firtsDate.join("T");

  let secondDate = b[columnOrder.datetime].split(" ");
  secondDate[0] = secondDate[0].split("/").reverse().join("-");
  secondDate = secondDate.join("T");

  return a[columnOrder.chatName].localeCompare(b[columnOrder.chatName]) || new Date(firtsDate) - new Date(secondDate);
};

/**
 * Calculates the median value from an array of numbers
 * 
 * @param {array} arr A flat array of numbers
 * @returns {number} Median value
 */
const getMedian = arr => {
  arr.sort((a, b) => a - b);
  const half = Math.floor(arr.length / 2);
  if (arr.length % 2) {
    return arr[half];
  }
  return (arr[half - 1] + arr[half]) / 2.0;
};

/**
 * Checks whether a specified record field contains one of values from a filter array
 * 
 * @param {array} record One record from AoA
 * @param {string} field Which field from message to check by
 * @param {array} filterArr Flat array of strings or RegExp object to check against
 * @returns {boolean} Whether field contains at least one value from array
 */
const hasValueFromArray = (message, column, filterArr) => {
  return filterArr.some(el => message[columnOrder[column]].toLowerCase().search(typeof el.toLowerCase === "function" ? el.toLowerCase() : el) !== -1);
};

// Exporting
exports.readJSONFile = readJSONFile;
exports.getInputFilename = getInputFilename;
exports.parseCsv = parseCsv;
exports.extractUrls = extractUrls;
exports.outputData = outputData;
exports.getWordFrequency = getWordFrequency;
exports.filterFrequecyArr = filterFrequecyArr;
exports.sortByChatNameThenByDate = sortByChatNameThenByDate;
exports.countDuplicates = countDuplicates;
exports.createAdjAndFiltered = createAdjAndFiltered;
exports.isInSpecialSources = isInSpecialSources;
exports.filterUniqueMessages = filterUniqueMessages;
exports.compareDuplicatesBySpecialSources = compareDuplicatesBySpecialSources;
exports.filterMostPopMessFromXUniqueAuthors = filterMostPopMessFromXUniqueAuthors;
exports.excludeSpam = excludeSpam;
exports.getMedian = getMedian;
exports.filterByMessageType = filterByMessageType;
exports.hasValueFromArray = hasValueFromArray;
exports.extractUrlsFromRecord = extractUrlsFromRecord;
