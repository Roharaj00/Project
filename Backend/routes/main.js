const express = require("express");
const axios = require("axios");
const router = express.Router();
const Recipe = require("../Models/Recipes");
const User = require("../Models/User");
const { authMiddleware } = require("./auth");

const API_BASE_URL = "https://api.spoonacular.com/recipes";

// Existing routes from previous implementation...
router.get("/recipes/search", async (req, res) => {
  const { name } = req.query;

  try {
    if (!name) {
      const response = await axios.get(`${API_BASE_URL}/random`, {
        params: {
          number: 12,
          apiKey: process.env.API_KEY,
        },
      });
      return res.json(response.data.recipes);
    }

    const response = await axios.get(`${API_BASE_URL}/search`, {
      params: {
        query: name,
        number: 12,
        apiKey: process.env.API_KEY,
        addRecipeInformation: true,
      },
    });
    res.json(response.data.results);
  } catch (error) {
    console.error("Error fetching recipes:", error);
    res.status(500).json({ error: "Failed to fetch recipes" });
  }
});

router.get("/recipes/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const response = await axios.get(`${API_BASE_URL}/${id}/information`, {
      params: {
        apiKey: process.env.API_KEY,
        includeNutrition: true,
        addRecipeInformation: true,
      },
    });

    if (response && response.data) {
      res.json({
        title: response.data.title,
        image: response.data.image,
        readyInMinutes: response.data.readyInMinutes,
        servings: response.data.servings,
        nutrition: response.data.nutrition,
        ingredients: response.data.extendedIngredients,
        instructions: response.data.instructions,
        summary: response.data.summary,
        sourceUrl: response.data.sourceUrl,
      });
    } else {
      res.status(404).json({ error: "Recipe not found" });
    }
  } catch (error) {
    console.error("Error fetching recipe details:", error);
    res.status(500).json({
      error: "Failed to fetch recipe details",
      message: error.message,
    });
  }
});

// Like/Unlike a Recipe
router.post("/like/:spoonacularId", authMiddleware, async (req, res) => {
  const { spoonacularId } = req.params;
  const userId = req.user.id;

  try {
    // Fetch recipe details from Spoonacular
    const recipeResponse = await axios.get(
      `${API_BASE_URL}/${spoonacularId}/information`,
      {
        params: {
          apiKey: process.env.API_KEY,
        },
      }
    );

    // Find or create a local recipe record
    let recipe = await Recipe.findOne({ spoonacularId });
    if (!recipe) {
      recipe = new Recipe({
        spoonacularId,
        title: recipeResponse.data.title,
        image: recipeResponse.data.image,
      });
    }

    // Find the user
    const user = await User.findById(userId);

    // Check if recipe is already liked
    const isLiked = user.likedRecipes.includes(recipe._id);

    if (isLiked) {
      // Unlike the recipe
      user.likedRecipes = user.likedRecipes.filter(
        (recipeId) => recipeId.toString() !== recipe._id.toString()
      );
      recipe.likedBy = recipe.likedBy.filter(
        (likedUserId) => likedUserId.toString() !== userId
      );
    } else {
      // Like the recipe
      user.likedRecipes.push(recipe._id);
      recipe.likedBy.push(userId);
    }

    await user.save();
    await recipe.save();

    res.json({
      message: isLiked ? "Recipe unliked" : "Recipe liked",
      liked: !isLiked,
    });
  } catch (error) {
    console.error("Error liking/unliking recipe:", error);
    res.status(500).json({ error: "Failed to like/unlike recipe" });
  }
});

// Get User's Liked Recipes
router.get("/liked-recipes", authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    // Find user and populate liked recipes with details
    const user = await User.findById(userId).populate({
      path: "likedRecipes",
      select: "spoonacularId title image",
    });

    // Fetch full recipe details from Spoonacular for each liked recipe
    const likedRecipesDetails = await Promise.all(
      user.likedRecipes.map(async (recipe) => {
        const response = await axios.get(
          `${API_BASE_URL}/${recipe.spoonacularId}/information`,
          {
            params: {
              apiKey: process.env.API_KEY,
              includeNutrition: true,
            },
          }
        );
        return response.data;
      })
    );

    res.json(likedRecipesDetails);
  } catch (error) {
    console.error("Error fetching liked recipes:", error);
    res.status(500).json({ error: "Failed to fetch liked recipes" });
  }
});

module.exports = router;