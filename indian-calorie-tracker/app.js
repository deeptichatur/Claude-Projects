// NutriDidi - Indian Calorie Tracker App

(function () {
    "use strict";

    // ===== STATE =====
    let state = {
        profile: loadFromStorage("nutrididi_profile", null),
        dailyGoal: loadFromStorage("nutrididi_goal", 0),
        meals: loadFromStorage("nutrididi_meals", { breakfast: [], lunch: [], dinner: [], snacks: [] }),
        mealsDate: loadFromStorage("nutrididi_meals_date", todayStr()),
        selectedFood: null,
    };

    // Reset meals if it's a new day
    if (state.mealsDate !== todayStr()) {
        state.meals = { breakfast: [], lunch: [], dinner: [], snacks: [] };
        state.mealsDate = todayStr();
        saveToStorage("nutrididi_meals", state.meals);
        saveToStorage("nutrididi_meals_date", state.mealsDate);
    }

    // ===== STORAGE HELPERS =====
    function loadFromStorage(key, fallback) {
        try {
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : fallback;
        } catch {
            return fallback;
        }
    }

    function saveToStorage(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function todayStr() {
        return new Date().toISOString().slice(0, 10);
    }

    // ===== CALORIE CALCULATION =====
    // Mifflin-St Jeor for women: BMR = 10*weight + 6.25*height - 5*age - 161
    function calculateDailyGoal(age, weight, height, activityFactor) {
        const bmr = 10 * weight + 6.25 * height - 5 * age - 161;
        return Math.round(bmr * activityFactor);
    }

    // ===== PROFILE FORM =====
    const profileForm = document.getElementById("profile-form");
    const goalDisplay = document.getElementById("calorie-goal-display");
    const goalValue = document.getElementById("calorie-goal-value");

    if (state.profile) {
        document.getElementById("age").value = state.profile.age;
        document.getElementById("weight").value = state.profile.weight;
        document.getElementById("height").value = state.profile.height;
        document.getElementById("activity").value = state.profile.activity;
        goalValue.textContent = state.dailyGoal;
        goalDisplay.classList.remove("hidden");
    }

    profileForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const age = parseInt(document.getElementById("age").value);
        const weight = parseFloat(document.getElementById("weight").value);
        const height = parseFloat(document.getElementById("height").value);
        const activity = parseFloat(document.getElementById("activity").value);

        state.profile = { age, weight, height, activity };
        state.dailyGoal = calculateDailyGoal(age, weight, height, activity);

        saveToStorage("nutrididi_profile", state.profile);
        saveToStorage("nutrididi_goal", state.dailyGoal);

        goalValue.textContent = state.dailyGoal;
        goalDisplay.classList.remove("hidden");
        updateDashboard();
    });

    // ===== PHOTO SCAN FEATURE =====
    const apiKeyInput = document.getElementById("api-key");
    const saveApiKeyBtn = document.getElementById("save-api-key-btn");
    const apiKeySetup = document.getElementById("api-key-setup");
    const apiKeySaved = document.getElementById("api-key-saved");
    const changeApiKeyBtn = document.getElementById("change-api-key-btn");
    const photoInput = document.getElementById("photo-input");
    const photoUploadArea = document.getElementById("photo-upload-area");
    const photoPlaceholder = document.getElementById("photo-placeholder");
    const photoPreview = document.getElementById("photo-preview");
    const analyzeBtn = document.getElementById("analyze-btn");
    const analysisResults = document.getElementById("analysis-results");
    const analysisLoading = document.getElementById("analysis-loading");
    const detectedFoodsList = document.getElementById("detected-foods-list");
    const analysisTotalCals = document.getElementById("analysis-total-cals");

    let currentPhotoBase64 = null;
    let detectedFoods = [];

    // API key management
    const savedKey = localStorage.getItem("nutrididi_api_key");
    if (savedKey) {
        apiKeySetup.classList.add("hidden");
        apiKeySaved.classList.remove("hidden");
    }

    saveApiKeyBtn.addEventListener("click", function () {
        const key = apiKeyInput.value.trim();
        if (!key) return;
        localStorage.setItem("nutrididi_api_key", key);
        apiKeySetup.classList.add("hidden");
        apiKeySaved.classList.remove("hidden");
        updateAnalyzeBtn();
    });

    changeApiKeyBtn.addEventListener("click", function () {
        apiKeySaved.classList.add("hidden");
        apiKeySetup.classList.remove("hidden");
        apiKeyInput.value = "";
        apiKeyInput.focus();
    });

    // Photo upload
    photoUploadArea.addEventListener("click", function () {
        photoInput.click();
    });

    photoInput.addEventListener("change", function () {
        const file = this.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            photoPreview.src = e.target.result;
            photoPreview.classList.remove("hidden");
            photoPlaceholder.classList.add("hidden");

            // Extract base64 data (remove data:image/...;base64, prefix)
            currentPhotoBase64 = e.target.result.split(",")[1];
            updateAnalyzeBtn();
        };
        reader.readAsDataURL(file);
    });

    function updateAnalyzeBtn() {
        const hasKey = !!localStorage.getItem("nutrididi_api_key");
        analyzeBtn.disabled = !(hasKey && currentPhotoBase64);
    }

    // Build the food list string for the AI prompt
    function getFoodListForPrompt() {
        return FOOD_DATABASE.map(f =>
            `${f.id}|${f.name}|${f.serving}|${f.calories}|${f.protein}|${f.carbs}|${f.fat}`
        ).join("\n");
    }

    // Analyze photo with Claude Vision
    analyzeBtn.addEventListener("click", async function () {
        const apiKey = localStorage.getItem("nutrididi_api_key");
        if (!apiKey || !currentPhotoBase64) return;

        // Show loading
        analysisLoading.classList.remove("hidden");
        analysisResults.classList.add("hidden");
        analyzeBtn.disabled = true;

        // Determine image media type
        const src = photoPreview.src;
        let mediaType = "image/jpeg";
        if (src.startsWith("data:image/png")) mediaType = "image/png";
        else if (src.startsWith("data:image/webp")) mediaType = "image/webp";
        else if (src.startsWith("data:image/gif")) mediaType = "image/gif";

        const foodList = getFoodListForPrompt();

        try {
            const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                    "anthropic-dangerous-direct-browser-access": "true",
                },
                body: JSON.stringify({
                    model: "claude-sonnet-4-20250514",
                    max_tokens: 1024,
                    messages: [{
                        role: "user",
                        content: [
                            {
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: mediaType,
                                    data: currentPhotoBase64,
                                },
                            },
                            {
                                type: "text",
                                text: `You are an Indian food nutrition expert. Look at this photo of food and identify all the Indian food items visible.

For each food item, match it to the closest item from this database (format: id|name|serving|calories|protein|carbs|fat):
${foodList}

Estimate the number of servings visible for each item.

Respond ONLY in this exact JSON format, no other text:
{"foods": [{"db_id": <number>, "name": "<name from database>", "servings": <number>}, ...]}

If a food is not in the database, use db_id: 0 and provide your best estimate:
{"db_id": 0, "name": "<food name>", "servings": 1, "calories": <number>, "protein": <number>, "carbs": <number>, "fat": <number>}

If no food is visible, respond: {"foods": []}`,
                            },
                        ],
                    }],
                }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `API error: ${response.status}`);
            }

            const data = await response.json();
            const text = data.content[0].text.trim();

            // Parse JSON from response (handle markdown code blocks)
            let jsonStr = text;
            const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

            const result = JSON.parse(jsonStr);
            detectedFoods = (result.foods || []).map(f => {
                if (f.db_id && f.db_id > 0) {
                    const dbFood = FOOD_DATABASE.find(x => x.id === f.db_id);
                    if (dbFood) {
                        return {
                            dbId: dbFood.id,
                            name: dbFood.name,
                            serving: dbFood.serving,
                            servings: f.servings || 1,
                            calories: dbFood.calories,
                            protein: dbFood.protein,
                            carbs: dbFood.carbs,
                            fat: dbFood.fat,
                        };
                    }
                }
                // Custom / not in DB
                return {
                    dbId: 0,
                    name: f.name,
                    serving: "1 serving",
                    servings: f.servings || 1,
                    calories: f.calories || 100,
                    protein: f.protein || 3,
                    carbs: f.carbs || 15,
                    fat: f.fat || 4,
                };
            });

            renderDetectedFoods();
            analysisResults.classList.remove("hidden");
        } catch (err) {
            alert("Error analyzing photo: " + err.message);
        } finally {
            analysisLoading.classList.add("hidden");
            updateAnalyzeBtn();
        }
    });

    function renderDetectedFoods() {
        if (detectedFoods.length === 0) {
            detectedFoodsList.innerHTML = '<p class="empty-state">No food items detected in the photo.</p>';
            analysisTotalCals.textContent = "0 kcal";
            return;
        }

        detectedFoodsList.innerHTML = detectedFoods.map((f, i) => `
            <div class="detected-food-item" data-index="${i}">
                <div class="detected-food-info">
                    <span class="detected-food-name">${f.name}</span>
                    <span class="detected-food-detail">${f.serving} &middot; ${f.calories} kcal/serving</span>
                </div>
                <input type="number" class="detected-food-qty" value="${f.servings}" min="0.25" max="10" step="0.25" data-index="${i}">
                <span class="detected-food-cals">${Math.round(f.calories * f.servings)} kcal</span>
                <button class="btn-remove-detected" data-index="${i}">&times;</button>
            </div>
        `).join("");

        updateAnalysisTotal();
    }

    function updateAnalysisTotal() {
        const total = detectedFoods.reduce((sum, f) => sum + Math.round(f.calories * f.servings), 0);
        analysisTotalCals.textContent = total + " kcal";
    }

    // Handle qty changes and removal in detected foods
    detectedFoodsList.addEventListener("input", function (e) {
        if (e.target.classList.contains("detected-food-qty")) {
            const idx = parseInt(e.target.dataset.index);
            detectedFoods[idx].servings = parseFloat(e.target.value) || 1;
            const item = e.target.closest(".detected-food-item");
            const calSpan = item.querySelector(".detected-food-cals");
            calSpan.textContent = Math.round(detectedFoods[idx].calories * detectedFoods[idx].servings) + " kcal";
            updateAnalysisTotal();
        }
    });

    detectedFoodsList.addEventListener("click", function (e) {
        const btn = e.target.closest(".btn-remove-detected");
        if (!btn) return;
        const idx = parseInt(btn.dataset.index);
        detectedFoods.splice(idx, 1);
        renderDetectedFoods();
    });

    // Add all detected foods to meal
    document.getElementById("add-all-detected-btn").addEventListener("click", function () {
        const mealType = document.getElementById("photo-meal-type").value;

        for (const f of detectedFoods) {
            const entry = {
                id: Date.now() + Math.random(),
                foodId: f.dbId,
                name: f.name,
                serving: f.serving,
                qty: f.servings,
                calories: Math.round(f.calories * f.servings),
                protein: Math.round(f.protein * f.servings * 10) / 10,
                carbs: Math.round(f.carbs * f.servings * 10) / 10,
                fat: Math.round(f.fat * f.servings * 10) / 10,
            };
            state.meals[mealType].push(entry);
        }

        saveToStorage("nutrididi_meals", state.meals);
        updateDashboard();
        renderLoggedMeals();
        clearPhotoAnalysis();
    });

    // Clear analysis
    document.getElementById("clear-analysis-btn").addEventListener("click", clearPhotoAnalysis);

    function clearPhotoAnalysis() {
        detectedFoods = [];
        currentPhotoBase64 = null;
        photoPreview.classList.add("hidden");
        photoPlaceholder.classList.remove("hidden");
        photoPreview.src = "";
        photoInput.value = "";
        analysisResults.classList.add("hidden");
        detectedFoodsList.innerHTML = "";
        updateAnalyzeBtn();
    }

    // ===== FOOD SEARCH =====
    const foodSearchInput = document.getElementById("food-search");
    const searchResultsDiv = document.getElementById("search-results");
    const servingQtyInput = document.getElementById("serving-qty");
    const servingUnitLabel = document.getElementById("serving-unit");
    const addFoodBtn = document.getElementById("add-food-btn");

    foodSearchInput.addEventListener("input", function () {
        const query = this.value.trim().toLowerCase();
        if (query.length < 2) {
            searchResultsDiv.classList.add("hidden");
            return;
        }

        const results = FOOD_DATABASE.filter(
            (f) =>
                f.name.toLowerCase().includes(query) ||
                f.category.toLowerCase().includes(query)
        ).slice(0, 10);

        if (results.length === 0) {
            searchResultsDiv.innerHTML = '<div class="search-item no-result">No foods found</div>';
        } else {
            searchResultsDiv.innerHTML = results
                .map(
                    (f) =>
                        `<div class="search-item" data-id="${f.id}">
                            <span class="search-food-name">${f.name}</span>
                            <span class="search-food-info">${f.calories} kcal &middot; ${f.serving}</span>
                        </div>`
                )
                .join("");
        }
        searchResultsDiv.classList.remove("hidden");
    });

    searchResultsDiv.addEventListener("click", function (e) {
        const item = e.target.closest(".search-item");
        if (!item || item.classList.contains("no-result")) return;

        const foodId = parseInt(item.dataset.id);
        state.selectedFood = FOOD_DATABASE.find((f) => f.id === foodId);
        foodSearchInput.value = state.selectedFood.name;
        servingUnitLabel.textContent = "(" + state.selectedFood.serving + ")";
        searchResultsDiv.classList.add("hidden");
        addFoodBtn.disabled = false;
        servingQtyInput.value = 1;
    });

    // Close search results when clicking outside
    document.addEventListener("click", function (e) {
        if (!e.target.closest("#food-search") && !e.target.closest("#search-results")) {
            searchResultsDiv.classList.add("hidden");
        }
    });

    addFoodBtn.addEventListener("click", function () {
        if (!state.selectedFood) return;

        const mealType = document.getElementById("meal-type").value;
        const qty = parseFloat(servingQtyInput.value) || 1;

        const entry = {
            id: Date.now(),
            foodId: state.selectedFood.id,
            name: state.selectedFood.name,
            serving: state.selectedFood.serving,
            qty: qty,
            calories: Math.round(state.selectedFood.calories * qty),
            protein: Math.round(state.selectedFood.protein * qty * 10) / 10,
            carbs: Math.round(state.selectedFood.carbs * qty * 10) / 10,
            fat: Math.round(state.selectedFood.fat * qty * 10) / 10,
        };

        state.meals[mealType].push(entry);
        saveToStorage("nutrididi_meals", state.meals);

        // Reset form
        foodSearchInput.value = "";
        servingUnitLabel.textContent = "";
        servingQtyInput.value = 1;
        state.selectedFood = null;
        addFoodBtn.disabled = true;

        updateDashboard();
        renderLoggedMeals();
    });

    // ===== DASHBOARD =====
    function getTotals() {
        let totalCals = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
        const mealCals = {};

        for (const mealType of ["breakfast", "lunch", "dinner", "snacks"]) {
            let mc = 0;
            for (const entry of state.meals[mealType]) {
                totalCals += entry.calories;
                totalProtein += entry.protein;
                totalCarbs += entry.carbs;
                totalFat += entry.fat;
                mc += entry.calories;
            }
            mealCals[mealType] = mc;
        }

        return { totalCals, totalProtein, totalCarbs, totalFat, mealCals };
    }

    function updateDashboard() {
        const { totalCals, totalProtein, totalCarbs, totalFat, mealCals } = getTotals();
        const goal = state.dailyGoal || 2000;

        // Update text
        document.getElementById("calories-consumed").textContent = totalCals;
        document.getElementById("calories-target").textContent = goal;
        document.getElementById("total-protein").textContent = Math.round(totalProtein) + "g";
        document.getElementById("total-carbs").textContent = Math.round(totalCarbs) + "g";
        document.getElementById("total-fat").textContent = Math.round(totalFat) + "g";

        // Update progress ring
        const circle = document.querySelector(".progress-ring-fill");
        const radius = 78;
        const circumference = 2 * Math.PI * radius;
        circle.style.strokeDasharray = circumference;
        const pct = Math.min(totalCals / goal, 1);
        circle.style.strokeDashoffset = circumference * (1 - pct);

        // Color the ring based on progress
        if (totalCals > goal) {
            circle.style.stroke = "#e74c3c";
        } else if (pct > 0.85) {
            circle.style.stroke = "#f39c12";
        } else {
            circle.style.stroke = "#27ae60";
        }

        // Meal calorie summaries
        for (const m of ["breakfast", "lunch", "dinner", "snacks"]) {
            document.getElementById(m + "-cals").textContent = mealCals[m] + " kcal";
        }
    }

    // ===== LOGGED MEALS =====
    function renderLoggedMeals() {
        const container = document.getElementById("logged-meals-list");
        const clearBtn = document.getElementById("clear-meals-btn");
        let hasEntries = false;

        let html = "";
        for (const mealType of ["breakfast", "lunch", "dinner", "snacks"]) {
            const items = state.meals[mealType];
            if (items.length === 0) continue;
            hasEntries = true;

            const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
            html += `<div class="meal-group"><h3>${mealLabel}</h3>`;
            for (const item of items) {
                html += `<div class="logged-item">
                    <div class="logged-item-info">
                        <span class="logged-item-name">${item.name}</span>
                        <span class="logged-item-detail">${item.qty} serving${item.qty !== 1 ? "s" : ""} &middot; P: ${item.protein}g &middot; C: ${item.carbs}g &middot; F: ${item.fat}g</span>
                    </div>
                    <div class="logged-item-actions">
                        <span class="logged-item-cals">${item.calories} kcal</span>
                        <button class="btn-remove" data-meal="${mealType}" data-id="${item.id}" title="Remove">&times;</button>
                    </div>
                </div>`;
            }
            html += "</div>";
        }

        if (!hasEntries) {
            container.innerHTML = '<p class="empty-state">No meals logged yet. Start by adding food above!</p>';
            clearBtn.classList.add("hidden");
        } else {
            container.innerHTML = html;
            clearBtn.classList.remove("hidden");
        }
    }

    // Remove individual item
    document.getElementById("logged-meals-list").addEventListener("click", function (e) {
        const btn = e.target.closest(".btn-remove");
        if (!btn) return;
        const mealType = btn.dataset.meal;
        const entryId = parseInt(btn.dataset.id);
        state.meals[mealType] = state.meals[mealType].filter((x) => x.id !== entryId);
        saveToStorage("nutrididi_meals", state.meals);
        updateDashboard();
        renderLoggedMeals();
    });

    // Clear all
    document.getElementById("clear-meals-btn").addEventListener("click", function () {
        if (!confirm("Clear all logged meals for today?")) return;
        state.meals = { breakfast: [], lunch: [], dinner: [], snacks: [] };
        saveToStorage("nutrididi_meals", state.meals);
        updateDashboard();
        renderLoggedMeals();
    });

    // ===== FOOD DATABASE BROWSER =====
    function renderCategoryTabs() {
        const tabs = document.getElementById("category-tabs");
        tabs.innerHTML = FOOD_CATEGORIES.map(
            (cat, i) =>
                `<button class="cat-tab ${i === 0 ? "active" : ""}" data-category="${cat}">${cat}</button>`
        ).join("");
        renderFoodTable(FOOD_CATEGORIES[0]);
    }

    document.getElementById("category-tabs").addEventListener("click", function (e) {
        const tab = e.target.closest(".cat-tab");
        if (!tab) return;
        document.querySelectorAll(".cat-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        renderFoodTable(tab.dataset.category);
    });

    function renderFoodTable(category) {
        const tbody = document.getElementById("food-table-body");
        const foods = FOOD_DATABASE.filter((f) => f.category === category);
        tbody.innerHTML = foods
            .map(
                (f) =>
                    `<tr>
                        <td>${f.name}</td>
                        <td>${f.serving}</td>
                        <td>${f.calories}</td>
                        <td>${f.protein}g</td>
                        <td>${f.carbs}g</td>
                        <td>${f.fat}g</td>
                    </tr>`
            )
            .join("");
    }

    // ===== INIT =====
    renderCategoryTabs();
    updateDashboard();
    renderLoggedMeals();
})();
