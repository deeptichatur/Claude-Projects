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
