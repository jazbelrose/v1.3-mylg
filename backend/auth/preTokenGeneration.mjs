import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';

const dynamo = DynamoDBDocument.from(new DynamoDB());
const tableName = process.env.USER_PROFILES_TABLE || 'UserProfiles';

export const handler = async (event) => {
  console.log("PreTokenGeneration event:", JSON.stringify(event, null, 2));

  const userId = event.request.userAttributes["custom:userId"];
  const role = "admin"; // or look it up dynamically like you’re already doing

  console.log("Final claims to add:", { role, "custom:userId": userId });

  event.response = {
    claimsOverrideDetails: {
      // ID token
      claimsToAddOrOverride: {
        role,
        "custom:userId": userId
      }
    },
    claimsAndScopeOverrideDetails: {
      // Access token
      accessTokenGeneration: {
        claimsToAddOrOverride: {
          role,
          "custom:userId": userId
        }
      }
    }
  };

  return event;
};