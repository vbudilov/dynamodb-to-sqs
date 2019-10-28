const AWS = require('aws-sdk');
const moment = require('moment');

const sqs = new AWS.SQS({apiVersion: '2012-11-05'});
const docClient = new AWS.DynamoDB.DocumentClient();

/**
 * Exports certain fields from a DDB database and send each 'row' as a record to SQS
 *
 * @param event
 * @param context
 * @returns {Promise<void>}
 */
exports.handler = async (event, context) => {

    const tableName = process.env.TABLE_NAME;
    const region = process.env.REGION;

    // Only needed for those instances where we're sending to SQS
    const sqsUrl = process.env.SQS_URL;
    const dateFieldToCheck = process.env.DATE_FIELD_TO_CHECK;

    AWS.config.update({region: region});

    let params = {
        // ExpressionAttributeValues: {
        //     ":setup": true
        // },
        // FilterExpression: "setup = :setup",
        TableName: tableName
    };

    // Scan DynamoDB
    try {
        // Read from the DDB table and get all of the needed fields
        let ddbItems = await docClient.scan(params).promise();

        if (!isEmpty(ddbItems))
            for (let ddbItem of ddbItems.Items) {


                let myDDBItemForSQS = {};

                // -- Put an SQS message for further analysis
                myDDBItemForSQS['id'] = ddbItem.userId;
                myDDBItemForSQS['sortKey'] = ddbItem.sortKey;
                myDDBItemForSQS['rssFeedLink'] = ddbItem.rssFeedLink;

                let jsonPayload = JSON.stringify(myDDBItemForSQS);

                // let dateDataWasLastUpdated = ddbItem[dateFieldToCheck]
                // if (!shouldIUpdateThisDataTarget(dateDataWasLastUpdated))
                //     continue;

                await sendToSQS(sqsUrl, jsonPayload)
            }

    } catch (err) {
        console.log("Error while getting accounts from DDB... ", err);
    }

    context.done(null);
};

/**
 * Determine if account needs to be updated for this particular Lambda function
 *
 * Logic:
 *
 * 1. If function name is in a sublist of relevant functions
 * 2. If lastUpdateTimestamp < currentDate by more than a day
 *
 * @param functionName
 * @param lastUpdateTimestamp
 */
function shouldIUpdateThisDataTarget(lastUpdateTimestamp) {
    console.log("shouldIUpdateThisDataTarget: lastUpdateTimestamp: " + lastUpdateTimestamp);
    let response = true;

    if (!lastUpdateTimestamp)
        response = true;
    else {
        let now = moment(new Date(Date.now()));
        let later = moment(new Date(lastUpdateTimestamp));
        let hours = now.diff(later, 'hours');

        console.log("Hours diff: " + hours);

        if (hours < 2)
            response = false
    }

    console.log("response: " + response);

    return response;

}

function isEmpty(obj) {
    for (let key in obj) {
        if (obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

sendToSQS = async (queueUrl, jsonPayload) => {
    let sqsParams = {
        DelaySeconds: 0,
        MessageBody: jsonPayload,
        QueueUrl: queueUrl
    };

    try {
        await sqs.sendMessage(sqsParams).promise();
    } catch (e) {
        console.log("Couldn't send the SQS message", e)
    }
};
