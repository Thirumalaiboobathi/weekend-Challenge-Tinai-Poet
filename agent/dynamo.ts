import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { ThinaiKey } from "./thinai";
import type { WeatherReading } from "./weatherThinai";

const REGION = process.env.AWS_REGION || "ap-south-1";
const TABLE_NAME = process.env.TABLE_NAME || "TinaiPoet";

// removeUndefinedValues: true so an absent optional field (e.g.
// `backfilled` on a normal scheduled run) can just be left undefined
// in the record object instead of needing a conditional spread at
// every call site — the default marshaller throws on undefined values.
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

export interface DailyRecord {
  date: string; // YYYY-MM-DD
  thinai: ThinaiKey;
  rule: string; // which weatherThinai.ts rule fired, e.g. "cloud cover >=60% ..."
  weather: WeatherReading;
  poem: string;
  poemTamil: string;
  imagery: string[];
  createdAt: string;
  backfilled?: boolean; // true only for entries written by the Phase 5 backfill script
}

// Same "scan the whole table, filter/sort in application code" choice
// as frontend/lib/dynamo.ts's getRecentPoems, for the same reason:
// DynamoDB Scan's own Limit caps items examined, not items matching a
// filter, and this table also holds POEM# and SCORE# items.
export async function getRecentDailyPoems(limit: number): Promise<DailyRecord[]> {
  const res = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(PK, :p)",
      ExpressionAttributeValues: { ":p": "DAILY#" },
    })
  );
  const items = (res.Items ?? []) as DailyRecord[];
  return items.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
}

export async function putDailyPoem(record: DailyRecord): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `DAILY#${record.date}`,
        SK: "META",
        ...record,
      },
    })
  );
}
