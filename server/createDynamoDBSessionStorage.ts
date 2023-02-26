import * as crypto from "crypto";
import type { SessionStorage, SessionIdStorageStrategy } from "@remix-run/node";
import { createSessionStorage } from "@remix-run/node";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

interface DynamoDBSessionStorageOptions {
  /**
   * The Cookie used to store the session id on the client, or options used
   * to automatically create one.
   */
  cookie?: SessionIdStorageStrategy["cookie"];

  /**
   * The AWS region where the table is provitioned.
   */
  region: string;

  /**
   * The table name used to store.
   */
  tableName: string;

  /**
   * The name of the DynamoDB attribute used to store the session ID.
   * This should be the table's partition key.
   */
  idx: string;

  /**
   * The name of the DynamoDB attribute used to store the expiration time.
   * If absent, then no TTL will be stored and session records will not expire.
   */
  ttl?: string;
}

/**
 * Session storage using a DynamoDB table.
 */
export function createDynamoDBSessionStorage({
  cookie,
  ...props
}: DynamoDBSessionStorageOptions): SessionStorage {
  const db = new DynamoDB({
    region: props.region
  });
  const doc = DynamoDBDocument.from(db);

  async function get(id: Record<string, any>) {
    const result = await doc.get({
      TableName: props.tableName,
      Key: id,
    });

    return result.Item || null;
  }

  async function put(item: { [x: string]: any }) {
    await doc.put({
      TableName: props.tableName,
      Item: item,
    });
  }

  return createSessionStorage({
    cookie,
    async createData(data, expires) {
      while (true) {
        let randomBytes = crypto.randomBytes(8);
        // This storage manages an id space of 2^64 ids, which is far greater
        // than the maximum number of files allowed on an NTFS or ext4 volume
        // (2^32). However, the larger id space should help to avoid collisions
        // with existing ids when creating new sessions, which speeds things up.
        let id = [...randomBytes]
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");

        if (await get({ [props.idx]: id })) {
          continue;
        }

        let params = {
          [props.idx]: id,
          ...data,
        };

        if (props.ttl) {
          params[props.ttl] = expires
            ? Math.round(expires.getTime() / 1000)
            : undefined;
        }

        await put(params);

        return id;
      }
    },
    async readData(id) {
      let data = await get({ [props.idx]: id });

      if (data) {
        delete data[props.idx];
        if (props.ttl) delete data[props.ttl];
      }

      return data;
    },
    async updateData(id, data, expires) {
      let params = {
        [props.idx]: id,
        ...data,
      };

      if (props.ttl) {
        params[props.ttl] = expires
          ? Math.round(expires.getTime() / 1000)
          : undefined;
      }

      await put(params);
    },
    async deleteData(id) {
      await doc.delete({
        TableName: props.tableName,
        Key: { [props.idx]: id },
      });
    },
  });
}
