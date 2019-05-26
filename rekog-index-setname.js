const AWS = require('aws-sdk');
const rekognition = new AWS.Rekognition();
const rp = require('request-promise').defaults({
	encoding: null
});
const cloudinary = require('cloudinary').v2;

var collection = "rekog-collection";
var confidence_threshold = 28;
var assetFolderPrefix = 'assets';
var trainingFolderPrefix = 'training';
var replacementText = '.-.-.-';
var faceLabelTagPrefix = 'faceLabel';
var similartityScore = 80;

exports.handler = (event, context, callback) => {
	let data = JSON.parse(event.body)
	//let data = event;
	if (data.notification_type === 'resource_tags_changed') {
		data.resources.forEach(resource => {
			if (resource.public_id.startsWith(trainingFolderPrefix) && resource.added) {
				console.log('data - ', JSON.stringify(data));
				resource.added.forEach(tag => {
					if (tag.startsWith(faceLabelTagPrefix)) {
						let url = 'https://res.cloudinary.com/' + cloudinary.config().cloud_name + '/image/upload/' + resource.public_id;
						handleUpload(resource.public_id, url)
					}
				})
			}
		})
	} else if (data.notification_type === 'upload') {
		if (data.public_id.startsWith(trainingFolderPrefix) && data.notification_type === 'upload' && data.tags && data.tags.length > 0) {
			console.log("In training ", JSON.stringify(data))
			data.tags.forEach(tag => {
				if (tag.startsWith(faceLabelTagPrefix)) {
					handleUpload(data.public_id, data.secure_url)
				}
			})
		} else if (data.public_id.startsWith(assetFolderPrefix)) {
			console.log("In assets")
			searchFaces(data.secure_url)
				.then(faces => {
					setTags(faces, data.public_id);
				});
		}
	}
};

const handleUpload = (public_id, url) => {
	console.log("in handle uplaod", public_id, url)
	var isCollectionFound = false;
	// LIST COLLECTIONS
	rekognition.listCollections({}, function (err, data) {
		console.log("in list collection ", public_id, url)
		if (err) {
			console.log(err, err.stack);
			callback("Could not list collections.");
		} else {
			if (data.CollectionIds.length > 0) {
				for (var i in data.CollectionIds) {
					if (data.CollectionIds[i] == collection) {
						isCollectionFound = true;
						break;
					}
				}
			}

			if (!isCollectionFound) {
				// CREATE COLLECTION 
				var params = {
					CollectionId: collection
				};

				rekognition.createCollection(params, function (err, data) {
					console.log("in create collection", public_id, url)
					if (err) {
						console.log(err, err.stack);
						callback("Error creating collection '" + collection + "'");
					} else {
						console.log("Collection created: " + JSON.stringify(data));
						indexFace(public_id, url);
					}
				});
			} else {
				indexFace(public_id, url);
			}
		}
	});
}

// INDEX A FACE [Add to custom collection and insert DynamoDB record
async function indexFace(public_id, url) {
	var paramsIndexFace = {
		CollectionId: collection,
		DetectionAttributes: [],
		ExternalImageId: public_id.replace(/\//g, replacementText), // ExternalImageId must match [a-zA-Z0-9_.\-]+
		Image: {
			Bytes: await rp(url)
				.then(data => new Buffer.from(data, 'base64'))
				.catch(err => err)
		}
	}

	await rekognition.indexFaces(paramsIndexFace, function (err, dataIndex) {
		if (err) {
			console.log(err, err.stack);
		} else {
			if (dataIndex.FaceRecords && dataIndex.FaceRecords.length > 0) {
				let newFaceId = dataIndex.FaceRecords[0].Face.FaceId;
				//let textToReplace = new RegExp("ReGeX" + replacementText + "ReGeX",'g');
				cloudinary.uploader.add_context('faceId=' + newFaceId, [public_id])
					.then(response => console.log("Context added  - ", JSON.stringify(response)))
					.catch(error => console.log(error))
			} else {
				console.log("No faces found - ", JSON.stringify(dataIndex))
			}
		}
	});
}

/*** SEARCH FACE COLLECTION - returns array of found collection FaceIDs ***/
async function searchFaces(imageUrl) {

	let foundFaces = new Array();

	var paramsSearch = {
		CollectionId: collection,
		FaceMatchThreshold: confidence_threshold,
		Image: {
			Bytes: await rp(imageUrl)
				.then(data => new Buffer.from(data, 'base64'))
				.catch(err => err)
		},
		MaxFaces: 5
	};
	return new Promise(async function (resolve, reject) {
		var rek_await = await rekognition.searchFacesByImage(paramsSearch, function (err, response) {
			if (err) {
				console.log(err, err.stack);
			} else {
				return response;
			}
		}).promise();

		// if match(es) against custom face collection, get the name(s) from dynamodb
		if (rek_await.FaceMatches.length > 0) {
			rek_await.FaceMatches.forEach((element, index, array) => {

				//extract faceid
				if (element.Similarity >= similartityScore) {
					let faceData = {
						faceId: element.Face.FaceId,
						confidence: element.Face.Confidence
					}
					foundFaces.push(faceData);
				}
			});
		}

		console.log("Total faces found - ", foundFaces.length);
		console.log("Total faces found - ", JSON.stringify(foundFaces));
		resolve(foundFaces);
	});

}

/*** SEARCH DynamoDB FOR PERSONNAME - returns array of found personNames ***/
async function setTags(faces, public_id) {
	let foundTags = new Array();

	faces.forEach(face => {
		cloudinary.api.resources_by_context("faceId", face.faceId, {
				tags: true
			})
			.then(response => {
				if (response.resources && response.resources.length > 0) {
					response.resources.forEach(resource => {
						resource.tags.forEach(tag => {
							if (tag.startsWith('faceLabel')) {
								let name = tag.substring(tag.indexOf('=') + 1, tag.length)
								cloudinary.uploader.add_tag([name, 'confidence=' + face.confidence], [public_id])
									.then(response => {
										console.log(response)
									})
									.catch(error => console.log(error))
							}
						})
					})

				}
			})
			.catch(error => console.log(error))
	})
	return foundTags;
}