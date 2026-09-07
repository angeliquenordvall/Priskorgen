export default async function handler(req, res) {
  try {
    const q = (req.query.q || "").trim();
    const postcode = req.query.postcode || "89132";
    const apiKey = process.env.PRIMAT_API_KEY;

    if (!apiKey) {
      throw new Error("PRIMAT_API_KEY saknas i Vercel.");
    }

    // ------------------------------------------------------------
    // 1. Hitta relevanta butiker för postnumret
    // ------------------------------------------------------------

    const storesResponse = await fetch(
      "https://primat.nu/api/v3/stores/resolve?postcode=" +
        encodeURIComponent(postcode),
      {
        headers: {
          Authorization: "Bearer " + apiKey
        }
      }
    );

    if (!storesResponse.ok) {
      const errorText = await storesResponse.text();

      throw new Error(
        "Primat kunde inte hitta butiker (" +
          storesResponse.status +
          "): " +
          errorText
      );
    }

    const storesData = await storesResponse.json();

    const selectedStores =
      storesData.default_selection ||
      storesData.stores?.default_selection ||
      [];

    // ------------------------------------------------------------
    // 2. Om katalogen uttryckligen efterfrågas
    // ------------------------------------------------------------

    if (req.query.catalog === "1") {
      const catalog = await getFullCatalog(
        selectedStores,
        apiKey
      );

      return res.status(200).json({
        postcode,
        selected_stores: selectedStores,
        catalog
      });
    }

    // ------------------------------------------------------------
    // 3. Ingen sökning = visa bara butiksinformationen
    // ------------------------------------------------------------

    if (!q) {
      return res.status(200).json({
        postcode,
        stores: storesData
      });
    }

    // ------------------------------------------------------------
    // 4. Hämta hela katalogen
    // ------------------------------------------------------------

    const catalog = await getFullCatalog(
      selectedStores,
      apiKey
    );

    // ------------------------------------------------------------
    // 5. Sök och rangordna lokalt
    // ------------------------------------------------------------

    const results = searchCatalog(catalog.data, q);

    return res.status(200).json({
      postcode,
      selected_stores: selectedStores,
      products: {
        data: results,
        count: results.length,
        query: q
      }
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
}


// ================================================================
// HÄMTA HELA PRIMAT-KATALOGEN
// ================================================================

async function getFullCatalog(stores, apiKey) {
  if (!stores || stores.length === 0) {
    return {
      data: [],
      count: 0,
      next_cursor: null
    };
  }

  const storeString = stores.join(",");

  const allRows = [];
  let cursor = null;

  while (true) {
    let url =
      "https://primat.nu/api/v3/prices?stores=" +
      encodeURIComponent(storeString) +
      "&limit=1000";

    if (cursor) {
      url += "&cursor=" + encodeURIComponent(cursor);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: "Bearer " + apiKey
      }
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        "Primat kunde inte hämta katalogen (" +
          response.status +
          "): " +
          errorText
      );
    }

    const data = await response.json();

    if (Array.isArray(data.data)) {
      allRows.push(...data.data);
    }

    cursor = data.next_cursor || null;

    if (!cursor) {
      break;
    }
  }

  return {
    data: allRows,
    count: allRows.length,
    next_cursor: null
  };
}


// ================================================================
// NORMALISERING
// ================================================================

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9åäö\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


// ================================================================
// SÖKNING I HELA KATALOGEN
// ================================================================

function searchCatalog(rows, query) {
  const q = normalizeText(query);

  if (!q) {
    return [];
  }

  const queryWords = q
    .split(/\s+/)
    .filter(Boolean);

  const scored = [];

  for (const product of rows) {
    const name = normalizeText(product.name);
    const brand = normalizeText(product.brand);
    const offerLabel = normalizeText(product.offer_label);

    const text =
      (name + " " + brand + " " + offerLabel).trim();

    if (!text) {
      continue;
    }

    let score = 0;

    // ------------------------------------------------------------
    // Exakt namnträff
    // ------------------------------------------------------------

    if (name === q) {
      score += 1000;
    }

    // Hela sökfrasen finns i produktnamnet
    if (name.includes(q)) {
      score += 500;
    }

    // ------------------------------------------------------------
    // Varje sökord
    // ------------------------------------------------------------

    let matchedWords = 0;

    for (const word of queryWords) {
      if (name.includes(word)) {
        matchedWords++;
        score += 120;
      } else if (brand.includes(word)) {
        matchedWords++;
        score += 40;
      } else if (text.includes(word)) {
        matchedWords++;
        score += 20;
      }
    }

    // Alla ord måste helst finnas
    if (matchedWords < queryWords.length) {
      continue;
    }

    // ------------------------------------------------------------
    // Specialhantering för kaffe
    // ------------------------------------------------------------

    if (q.includes("kaffe")) {
      if (
        name.includes("bryggkaffe") ||
        name.includes("brygg kaffe")
      ) {
        score += 250;
      }

      if (
        name.includes("kokkaffe") ||
        name.includes("kok kaffe")
      ) {
        score += 250;
      }

      if (
        name.includes("kaffebon") ||
        name.includes("kaffe bon") ||
        name.includes("espressobon") ||
        name.includes("espresso bon") ||
        name.includes("coffee beans")
      ) {
        score += 250;
      }

      if (
        name.includes("kaffekaps") ||
        name.includes("kaffe kaps") ||
        name.includes("kapsel")
      ) {
        score += 100;
      }

      if (
        name.includes("kaffefilter") ||
        name.includes("kaffe filter")
      ) {
        score += 80;
      }

      // Produkter som bara råkar innehålla "kaffe"
      // får lägre prioritet än riktiga kaffeprodukter.
      if (
        !name.includes("kaffe") &&
        !brand.includes("kaffe")
      ) {
        score -= 100;
      }
    }

    // ------------------------------------------------------------
    // Specialhantering för smör
    // ------------------------------------------------------------

    if (q.includes("smor")) {
      if (
        name.includes("smorgasmargarin") ||
        name.includes("smorgasmargarin") ||
        name.includes("smordeg") ||
        name.includes("jordnotssmor") ||
        name.includes("persiljesmor") ||
        name.includes("kryddsmor") ||
        name.includes("smorkn") ||
        name.includes("smorgas")
      ) {
        score -= 300;
      }

      if (
        name.includes("smor normalsaltat") ||
        name.includes("smor extrasaltat") ||
        name.includes("smor osaltat")
      ) {
        score += 300;
      }
    }

    // ------------------------------------------------------------
    // Produkter utan pris hamnar sist
    // ------------------------------------------------------------

    if (product.effective_price != null) {
      score += 15;
    }

    // Lite extra vikt åt produkter med GTIN
    if (product.gtin) {
      score += 5;
    }

    scored.push({
      product,
      score
    });
  }

  // ------------------------------------------------------------
  // Sortera bästa träffarna först
  // ------------------------------------------------------------

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    const aName = normalizeText(a.product.name);
    const bName = normalizeText(b.product.name);

    return aName.localeCompare(bName);
  });

  // ------------------------------------------------------------
  // Ta bort exakta dubbletter
  // ------------------------------------------------------------

  const seen = new Set();
  const results = [];

  for (const item of scored) {
    const product = item.product;

    const key =
      product.gtin ||
      [
        product.name,
        product.brand,
        product.package,
        product.amount,
        product.unit
      ]
        .filter(Boolean)
        .join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    results.push(product);

    // Frontendens nuvarande gräns är 100.
    if (results.length >= 100) {
      break;
    }
  }

  return results;
}
