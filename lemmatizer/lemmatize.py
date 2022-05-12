# System modules
import csv
import sys
import getopt
import re
import math
from datetime import datetime
from string import punctuation
import argparse

# 3rd-party modules
from nltk.corpus import stopwords
from pymystem3 import Mystem

# Constants
TEXT_COLUMN_INDEX = 2
# TYPE_COLUMN_INDEX = 2
SEPARATOR_FOR_JOIN = ' ix3uzumgm9jtf6pq '
CHUNK_SIZE = 20000
chunk_counter = 0


def main():
    # Parse input path, extract parameters
    args = parse_argv()
    input_path = args.input_path
    global chunk_size, offset
    offset = args.offset
    chunk_size = args.chunk_size

    input_filename_without_extention = get_input_filename(input_path)

    # Count number of rows in input file
    row_count = 0
    with open(input_path, newline='', encoding='utf-8') as csvfile:
        scv_reader = csv.reader(csvfile, delimiter=',', quotechar='"')
        row_count = sum(1 for row in scv_reader)
    
    total_chunks = math.ceil((row_count - offset)/ chunk_size)
    print(f'Total row count: {row_count}. Chunk size: {chunk_size}. Initial offset: {offset}. Chunks to process: {total_chunks}.')

    # Loop through input file in chunks, lemmatize a chunk, then save it
    while offset + (chunk_size * chunk_counter) < row_count:
        # Parse a chunk
        parsed_csv = parse_csv(input_path)

        # Extract messages of 'chat' type
        # only_chats = [
        #     row for row in parsed_csv if row[TYPE_COLUMN_INDEX] == 'chat']
        # Log chunk info
        starting_row = offset + (chunk_size * (chunk_counter - 1))
        is_last_chunk = total_chunks == chunk_counter
        finishing_row = (starting_row + chunk_size if not is_last_chunk else row_count) - 1
        current_offset = offset + (chunk_size * (chunk_counter - 1))
        print(
            f'Chunk: {chunk_counter}/{total_chunks} (rows: {starting_row}-{finishing_row}). \
Current offset: {current_offset}.')
# Rows of chat type: {len(only_chats)}/{len(parsed_csv)}')

        # Join all texts into a single string
        joined_texts = SEPARATOR_FOR_JOIN.join(
            [row[TEXT_COLUMN_INDEX] for row in parsed_csv])
        print('Joined text length:', len(joined_texts))
        # Lemmatize text
        lemmatized_text = lemmatize_text(joined_texts)
        # Split back into separate texts
        lemmatized_texts_list = lemmatized_text.split(SEPARATOR_FOR_JOIN)
        print('Processed chunk row count:', len(lemmatized_texts_list))

        # If differenct row count between original and processed, log first and last texts in both
        if len(parsed_csv) != len(lemmatized_texts_list):
            print('Row count changed after lemmatization.')
            print('First original text:', parsed_csv[0])
            print('First processed text:', lemmatized_texts_list[0])
            print('Last original text:', parsed_csv[-1])
            print('Last processed text:', lemmatized_texts_list[-1])
            sys.exit(2)

        # Insert lemmatized texts into original chunk
        parsed_csv_output = add_lemmatized_texts(
            parsed_csv, lemmatized_texts_list)
        # Append lemmatized chunk to output file
        output_csv(parsed_csv_output, input_filename_without_extention)

        print(f'Chunk {chunk_counter} finished successfully')

    # Verify equal number of rows in the original and lemmatized
    with open(f'./output/{input_filename_without_extention}_lemm.csv', newline='', encoding='utf-8') as csvfile:
        scv_reader = csv.reader(csvfile, delimiter=',', quotechar='"')
        new_row_count = sum(1 for row in scv_reader)
        is_difference = row_count - new_row_count
        print(
            f'Original row count: {row_count}. Lemmatized row count: {new_row_count}. Difference: {row_count - new_row_count}')
        if is_difference:
            print('WARNING: number of rows changed after lemmatization. Something went wrong.')

    # Log success
    print(
        f'The file \'./output/{input_filename_without_extention}_lemm.csv\' has been completed!')


# Parses passed parameters, requires only -i flag with value, otherwise throws error
def parse_argv():
    parser = argparse.ArgumentParser(description='Lemmatizes input text records')
    parser.add_argument('-i', dest='input_path')
    parser.add_argument('--chunk_size', default=CHUNK_SIZE, type=int)
    parser.add_argument('--offset', default=0, type=int)
    
    args = parser.parse_args()

    if args.input_path == None:
        print('lemmatize.py -i <inputfile>')
        sys.exit(2)
    
    return args

# Locates filename in the provided filepath
def get_input_filename(input_path):
    matches = re.findall(r'\/?([^\/]+)\.csv$', input_path)
    if matches:
        return matches[0]
    else:
        print('Can\'t find filename in -i argument value')
        sys.exit(2)


# Parses a chunk of .csv rows. Chunk size is determined by --chunk_size parameter or CHUNK_SIZE constant
def parse_csv(input_path):
    global chunk_counter
    parsed_csv = []
    starting_row = offset + (chunk_size * chunk_counter)
    with open(input_path, newline='', encoding='utf-8') as csvfile:
        scv_reader = csv.reader(csvfile, delimiter=',', quotechar='"')
        for i, row in enumerate(scv_reader):
            if starting_row <= i < starting_row + chunk_size:
                parsed_csv.append(row)
    chunk_counter += 1
    return parsed_csv


# Lemmatizes provided text string
# As per https://www.kaggle.com/alxmamaev/how-to-easy-preprocess-russian-text and https://habr.com/ru/post/503420/
def lemmatize_text(text):
    # Inserts messages that were lost during lemmatization so that returned string can be split into the same number of original texts
    def map_func(token):
        index = token[0]
        value = token[1]

        if index == 0 and value == SEPARATOR_FOR_JOIN.strip():
            return ' ' + value

        last = index == len(tokens) - 1
        shouldPad = tokens[index] == SEPARATOR_FOR_JOIN.strip(
        ) and tokens[index - 1] == SEPARATOR_FOR_JOIN.strip()

        if shouldPad and last:
            return ' ' + value + ' '
        elif last:
            return value + ' '
        elif shouldPad:
            return ' ' + value
        else:
            return value

    # Initialize lemmatizator and get stopwords (functional words and such)
    mystem = Mystem()
    russian_stopwords = stopwords.words("russian")

    # Lemmatize text string, returns a list of lemmatized 'tokens' (words and similar)
    tokens = mystem.lemmatize(text.lower())
    # Filter out non-words and stopwords
    tokens = [token for token in tokens if token not in russian_stopwords
              and token != " "
              and token.strip() not in punctuation]
    # Insert single spaces where needed to preserve initial texts' count
    tokens = list(map(map_func, enumerate(tokens)))
    # Join tokens into a string
    text = " ".join(tokens)
    return text


# Add lemmatized text into their original rows
def add_lemmatized_texts(parsed_csv, lemmatized_texts_list):
    counter = 0
    for row in parsed_csv:
        # if row[TYPE_COLUMN_INDEX] == 'chat':
        row.append(lemmatized_texts_list[counter])
        counter += 1
    return parsed_csv


# Append (or create if not existing) .csv file with a chunk of rows
def output_csv(list, input_filename):
    output_filename = f'./output/{input_filename}_lemm.csv'
    with open(output_filename, 'a', newline='', encoding='utf-8') as csvfile:
        scv_writer = csv.writer(csvfile, delimiter=',',
                                quotechar='"', quoting=csv.QUOTE_ALL)
        for row in list:
            scv_writer.writerow(row)


if __name__ == '__main__':
    main()
