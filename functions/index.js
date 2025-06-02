/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const functions = require("firebase-functions");
const axios = require("axios");
const cheerio = require("cheerio");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// Recipe scraping function
exports.scrapeRecipe = functions.https.onCall(async (data, context) => {
  try {
    const {url} = data;
    if (!url) {
      throw new Error("URL is required");
    }

    // Fetch the webpage
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Extract recipe data
    const recipe = {
      title: $("h1").first().text().trim(),
      ingredients: [],
      instructions: [],
      image:
        $("meta[property='og:image']").attr("content") ||
        $("img").first().attr("src"),
      host: new URL(url).hostname,
    };

    // Try to find ingredients
    $("li").each((i, elem) => {
      const text = $(elem).text().trim();
      if (text && text.length < 200) {
        recipe.ingredients.push(text);
      }
    });

    // Try to find instructions
    $("p, ol li").each((i, elem) => {
      const text = $(elem).text().trim();
      if (text && text.length > 20) {
        recipe.instructions.push(text);
      }
    });

    return recipe;
  } catch (error) {
    console.error("Error scraping recipe:", error);
    throw new functions.https.HttpsError(
        "internal",
        "Error scraping recipe: " + error.message,
    );
  }
});
