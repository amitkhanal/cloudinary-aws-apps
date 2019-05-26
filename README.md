# Purpose
This application attempts to recognize people in images that are uploaded to Cloudinary. If people are recognized, it will create a tag with the their name.
There are 2 parts to this application - 
1. Training the model - Creates a training model based on images that are uploaded to a dedicated training folder in Cloudianry. The images should be of people showing their faces
2. Recognize - Recognizes people in images that user uploads to a dedicated asset folder in Cloudinary. The recognizition happens based on training model created in step 1.

# Components/Systems used - 
1. Cloudinary for image upload, tagging
2. AWS Reconizition service to train and recognize images
3. AWS Lambda function to run this code as a NodeJS application
4. AWS API Gatetay to expose the lambda function via API
   
# High level Overview

## API/Lambda
1. Deploy this code as a AWS Lambda function. Set 'CLOUDINARY_URL' in the environment variable of the lambda function. This is required for Cloudinary APIs to work
2. Create and deploy an API via API Gateway backed by Lambda Function create above
3. Set the API endpoint at 'Notification URL' at https://cloudinary.com/console/settings/upload

## Training
1. Upload images to 'training' folder in Cloudinary. This folder name is configurable in the application
2. In order for the training to be triggered for the uploaded image, the image should have a tag 'faceLabel=person's name>'. This tag can be uploaded during the upload or after the image is uploaded to Cloudinary
3. Once above steps are done, Cloudinary will trigger the 'Notification URL' (and subsequently lambda function) which will then start the training for that image. The training will use the name configured on 'faceLabel' to label the training image
4. Once training is done, the lambda function will set a unique 'faceId' on the context field on the image in Cloudinary, where key is 'faceId' and value is the indentifier returned by training service.

## Recognize
1. Upload images to 'asset' folder in Cloudinary. This folder name is configurable in the application. 
2. Once the image is uploaded, Cloudinary will trigger the Notification URL' (and subsequently lambda function) that will invoke AWS Recognizition service to see if the person on that image matches with any images within the training model.
3. If there is a match, AWS recognizition will return a collection of the matched faces eaching having their own unique face id
4. The lambda function iterates over the collection of matched faces and uses their face ids to lookup images by context in Cloudinary
5. If images are found, the person's name is extracted from the 'faceLabel' and subsequently this name is added as a tag on the uploaded image on step 1.

# Constraints 
1. Currently the application can only identify one face in an image even if the image has multiple faces
2. Only image recognizition is supported. Video recognizition is not