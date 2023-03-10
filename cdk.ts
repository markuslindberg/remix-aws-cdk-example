#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Bucket } from "aws-cdk-lib/aws-s3";
import {
  BucketDeployment,
  CacheControl,
  Source,
} from "aws-cdk-lib/aws-s3-deployment";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  LambdaEdgeEventType,
  OriginAccessIdentity,
  OriginRequestCookieBehavior,
  OriginRequestHeaderBehavior,
  OriginRequestPolicy,
  OriginRequestQueryStringBehavior,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

class CdkRemixAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const assetsBucket = new Bucket(this, "AssetsBucket", {
      autoDeleteObjects: true,
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const assetsBucketOriginAccessIdentity = new OriginAccessIdentity(
      this,
      "AssetsBucketOriginAccessIdentity"
    );

    const assetsBucketS3Origin = new S3Origin(assetsBucket, {
      originAccessIdentity: assetsBucketOriginAccessIdentity,
    });

    assetsBucket.grantRead(assetsBucketOriginAccessIdentity);

    const edgeFn = new NodejsFunction(this, "EdgeFn", {
      currentVersionOptions: {
        removalPolicy: RemovalPolicy.DESTROY,
      },
      entry: "server/index.ts",
      logRetention: RetentionDays.THREE_DAYS,
      memorySize: 1024,
      timeout: Duration.seconds(10),
      runtime: Runtime.NODEJS_18_X,
    });

    const distribution = new Distribution(this, "Distribution", {
      defaultBehavior: {
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        compress: true,
        edgeLambdas: [
          {
            eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
            functionVersion: edgeFn.currentVersion,
            includeBody: true,
          },
        ],
        origin: assetsBucketS3Origin,
        originRequestPolicy: new OriginRequestPolicy(
          this,
          "OriginRequestPolicy",
          {
            headerBehavior: OriginRequestHeaderBehavior.all(),
            queryStringBehavior: OriginRequestQueryStringBehavior.all(),
            cookieBehavior: OriginRequestCookieBehavior.all(),
          }
        ),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "build/*": {
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          origin: assetsBucketS3Origin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
    });

    new BucketDeployment(this, "AssetsDeployment", {
      destinationBucket: assetsBucket,
      distribution,
      prune: true,
      sources: [Source.asset("public")],
      cacheControl: [
        CacheControl.maxAge(Duration.days(365)),
        CacheControl.sMaxAge(Duration.days(365)),
      ],
    });

    new dynamodb.Table(this, "RemixAppSessions", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "_idx", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "_ttl",
    });
  }
}

const app = new cdk.App();
new CdkRemixAppStack(app, "CdkRemixAppStack", {
  env: { region: "us-east-1" },
});
