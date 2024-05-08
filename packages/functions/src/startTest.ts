import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { Table } from 'sst/node/table';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(client);
/*
 * This function is called when the user starts a test.
 * It retrieves a random question from the database based on the test type.
 * Then it stores the question in the database in the user's record.
 */
export const main = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const PK = event.pathParameters?.questionType;
  const possibleQuestionTypes = [
    'writing',
    'reading',
    'listening',
    'speaking',
    'fullTest',
  ];

  // Test sections
  const testSections = ['Writing', 'Reading', 'Listening', 'Speaking'];

  const userID = event.requestContext.authorizer;
  console.log(userID);

  //validate the question type
  if (!PK || !possibleQuestionTypes.includes(PK)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Invalid question type',
      }),
    };
  }

  try {
    // Get the index of the questions
    let Questions;
    if (PK === 'FullTest') {
      const _Questions = testSections.map(async (PK: string) => {
        return await getQuestion(PK);
      });
      const QuestionsArray = Promise.all(_Questions);
      Questions = {
        ...(await QuestionsArray)[0],
        ...(await QuestionsArray)[1],
        ...(await QuestionsArray)[2],
        ...(await QuestionsArray)[3],
      };
    } else {
      Questions = await getQuestion(PK);
    }

    // Store the question in the user's record
    const putCommand = new PutCommand({
      TableName: Table.Records.tableName,
      Item: {
        PK: userID,
        SK: Date.now().toString + uuidv4(),
        ...Questions,
      },
    });

    await dynamoDb.send(putCommand);

    return {
      statusCode: 200,
      body: JSON.stringify(Questions),
    };
  } catch (err) {
    console.log(err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'some error happened',
      }),
    };
  }
};

const getQuestion = async (PK: string) => {
  const getIndexCommand = new GetCommand({
    // Get the table name from the environment variable
    TableName: Table.Records.tableName,
    // Get the item which stores the sort keys of the available questions
    Key: {
      PK: PK,
      SK: 'index',
    },
  });

  // Retrieve the index item which contains the list of the sort keys of the available questions from the table
  const results = (await dynamoDb.send(getIndexCommand))!;
  const index = results.Item?.index
    ? results.Item?.index
    : (() => {
        throw new Error('Index not found');
      })();

  if (index.length === 0) {
    throw new Error('No questions found for ' + PK);
  }

  // Select a random sort key from the index list
  let randomItemSortKey = index[Math.floor(Math.random() * index.length)];

  // Get the question with the selected sort key
  const getQuestionCommand = new GetCommand({
    // Get the table name from the environment variable
    TableName: Table.Records.tableName,
    // Get the question with the selected sort key
    Key: {
      PK: PK,
      SK: randomItemSortKey,
    },
  });
  const response = await dynamoDb.send(getQuestionCommand);

  return response.Item;
};
