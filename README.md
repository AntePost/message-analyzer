# Message analyzer

## Summary
This is a console application for processing and analyzing structered text data

### Main features
- Inputs .csv data
- Outputs data as .csv or .xlsx
- Filters .csv based on lists of strings or regEx queries
- Lemmatizes Russian texts
- Performs full-text search over messages
- Extracts URLs from texts
- Calculates number of duplicate messages
- Calculates word frequency in texts
- Gathers metadata about messages

## Requirements for lemmatization
- Python 3
- nltk and pymystem3 packages

## Before first use
Run innitialize.py (only for lemmatization)
Rename config.json.default into config.json and similarly rename files in 'resources' folder

## lemmatize.py
Script for lemmatizing text field in messages
Chats should be in .csv format (delimiter: ',', quotechar: '"')
Columns should be these in order:
1. Chat name
2. Time and date
3. Message type
4. Phone number
5. Username
6. Message text
Outputs result into 'output' folder (relative to the current directory) suffixed with '_lemm'

### Arguments
- '-i': path to the input file (e.g. './input/messages.csv')
- '--chunk_size': number of rows to process in one batch (optional, defaults to 20000)
- '--offset': number of rows to skip from the beggining (optional, defaults to 0)

## main.js
Script for analyzing WhatsApp chats
Chats should be in .csv format (delimiter: ',', quotechar: '"')
Columns should be these in order:
1. Chat name
2. Time and date
3. Message type
4. Phone number
5. Username
6. Message text
7. Lemmatized text
Outputs result into 'output/subfolder'
Subfolder name is taken from the input file name
Suffixes for output files depend on the operation type

### Arguments
- '-i': path to input file (e.g. './input/messages.csv')
- '-o': output format. Takes value 'csv' and 'xlsx'. Some operations only allow .csv or don't output to a file
- '-t' - type of the operation. Can have following values:
  - 'url': extracts URLs from text field in messages (images, videos, inline URLs)
    - '-u': outputs URLs in one list without subcategories (images, videos, inline URLs)
  - 'freq': extracts word frequency and word power (number of messages where a given string occurs) data from lemmatized text
  - 'filter': filters messages by regEx queries and outputs result in specific format
    - '-q': which query to use. If omitted, all queres are performed. A list of queries is provided in './regex_queries.js.default'
  - 'compare-dupl': Compares presence of certain strings within certain chats and outside (see './special_sources.json.default' for strings and chats used)
  - 'x-most-duples': Gets x most often repeated duplicates that are 10 of more words and keeps only 1 message per user
    - '-x': number of top duplicates
    - '-u': with the flag filters by URL presence, not by a number of words
  - 'field-and-values': filters messages by a given field and an array of strings (must be a complete match, see './special_sources.json.default' for strings used). In the current version requires changing source code to select correct 'dataForExtraction' key in main.js
    - '-f': which field to filter by
  - 'exclude-spam': filters messages in a text field by a number of lists of strings (see './spam_words.js.default' for strings used)
  - 'determ-dates': determines the dates of the earliest and the latest messages in an input file
  - 'meta': gathers metadata about the provided file (number of messages, chats, messages per chat on average etc.)
  - 'split': splits an input file into chunks of variable size
    - '--chunk_size': an integer to determine chunk size
- '--lemm': whether an input file is lemmatized. To set as false: '--lemm=false'. It MUST be the last argument. Please provide correct option to avoid errors, program does not autodetect lemmatization

## Config parameters
- inputFileExtention: the extention to search for in an input path ('-i'). Currently only 'scv' is supported
- defaultOutputMethod: which output method is chosen when '-o' is omitted
- defaultFolderNameLength: how many symbols at the start of the input file to take to make a subfolder in './output/'
- defaultLemmatization: whether an input file is lemmatized if '--lemm' is omitted
- defaultNumForMostDuplsOption: default number of records output after '-t x-most-duples' if '-x' is omitted

## RegEx query components
To perform full text search on messages following components may be used:
- Using 'ius' flags is highly recommended
- Logical OR: `/самолет|аэропорт/ius`
- Logical AND: `/^(?=.*самолет)(?=.*аэропорт)/ius`. More than 2 parts can be used
- Combining AND and OR: `/^(?=.*(самолет|поезд))(?=.*(аэропорт|вокзал))/ius`
- Logical NOT: `/^(?=.*аэропорт)(?!.*самолет)/ius`. Second component is NOT, but order doesn't matter
- Because order doesn't matter it is reccomended to put the most "excluding" part first: the one that contains the rarest words (or the most common if it's a NOT)
- Proximity search: `/(?:самолет)[\p{L}\p{N}_-]*[^\p{L}\p{N}_-]+(?:[\p{L}\p{N}_-]+[^\p{L}\p{N}_-]+){0,5}(?:аэропорт)|(?:аэропорт)[\p{L}\p{N}_-]*[^\p{L}\p{N}_-]+(?:[\p{L}\p{N}_-]+[^\p{L}\p{N}_-]+){0,5}(?:самолет)/ius`. Matches both parts with at most 5 words in between. Requires doubling to account for a possible reversal of search terms
- Word boundary: `/(?<=[^\p{L}\p{N}_-]|^)самолет(?=[^\p{L}\p{N}_-]|$)/ius`. JS-flavoured RegEx doesn't work well with `/\b/` in Cyrillic, so this substitute was made. Mind the difference between pre- and postposition
- Phrasal search: `/больш[\p{L}\p{N}_-]*?[^\p{L}\p{N}_-]+самолет/ius`. Mind the fact that only word roots should be used to capture all inflections
- Search with inflections: `/при[её]м(?=([ауе]|ом)?[^\p{L}\p{N}_-]|$)))/uis`. `/([ауе]|ом)/` part of the query should account for all possible inflections
- Miscellaneous: `/?/` quantifier and `/[abc]/` character class can be used to account for misspellings and alternating roots. E.g. `/р[оа]ст|за[йе]к|д[еи]з[еи]нт[еи]р/`

## Known bugs
- pymystem3 may refuse to work on Windows (see https://github.com/nlpub/pymystem3/issues/26)
- pymystem3 may work slow on Windows (see https://github.com/nlpub/pymystem3/issues/29, workaround available)
- lemmatize.py can get memoryError if input file is large enough (tested on x86 interpreter). Lemmatized file is saved piecemeal (each chunk is appended) so you can restart from the same place by adjusting --chunk-size and passing correct --offset.
- .csv output in main.js can sometimes result in incorrect parsing by Excel
- .xlsx output is sometimes broken on export and has to be repaired (with no apparent data loss). Also it always has bigger size than necessary. Both problems are fixed by resaving it through Excel
- If lemmatize.py doesn't show console messages in real time, start python with -u flag
