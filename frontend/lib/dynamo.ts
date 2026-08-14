import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "ap-south-1";
const TABLE_NAME = process.env.TABLE_NAME || "TinaiPoet";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

export async function putPoem(item: {
  id: string;
  situation: string;
  thinai: string;
  poem: string;
  poemTamil?: string;
  reason: string;
  createdAt: string;
}): Promise<void> {
  const { poemTamil, ...rest } = item;
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `POEM#${item.id}`,
        SK: "META",
        ...rest,
        // DynamoDBDocumentClient's default marshaller throws on
        // `undefined` attribute values, so this key is only included
        // when the Bedrock path actually produced a Tamil stanza.
        ...(poemTamil ? { poemTamil } : {}),
      },
    })
  );
}

export interface PoemRecord {
  id: string;
  situation: string;
  thinai: string;
  poem: string;
  poemTamil?: string;
  reason: string;
  createdAt: string;
}

// DynamoDB Scan's own Limit caps items *examined*, not items matching a
// FilterExpression, so it can't reliably return "the most recent N poems"
// on a table that also holds SCORE# items — a plain Scan+Limit could come
// back with fewer than N poems even when more exist. At this app's scale
// (one demo table, low item count) scanning the POEM# items in full and
// sorting/limiting in application code is simpler and actually correct;
// a GSI keyed on a constant partition + createdAt would be the fix if
// this table ever needed to scale past a demo.
export async function getRecentPoems(limit: number): Promise<PoemRecord[]> {
  const res = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(PK, :p)",
      ExpressionAttributeValues: { ":p": "POEM#" },
    })
  );
  const items = (res.Items ?? []) as PoemRecord[];
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}

export interface ScoreState {
  currentStreak: number;
  bestStreak: number;
  plays: number;
}

export async function getScore(sessionId: string): Promise<ScoreState | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SCORE#${sessionId}`, SK: "META" },
    })
  );
  if (!res.Item) return null;
  return {
    currentStreak: res.Item.currentStreak ?? 0,
    bestStreak: res.Item.bestStreak ?? 0,
    plays: res.Item.plays ?? 0,
  };
}

export async function putScore(sessionId: string, state: ScoreState): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `SCORE#${sessionId}`,
        SK: "META",
        sessionId,
        ...state,
        updatedAt: new Date().toISOString(),
      },
    })
  );
}
