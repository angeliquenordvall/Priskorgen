export default async function handler(req, res) {
  try {
    const q = req.query.q;
    const postcode = req.query.postcode || "89132";

    // ------------------------------------------------------------
    // Hämta butiker från Primat
    // ------------------------------------------------------------
    const storesResponse = await fetch(
      "https://primat.nu/api/v3/demo/stores/resolve?postcode=" +
        encodeURIComponent(postcode)
    );

    if (!storesResponse.ok) {
      throw new Error(
        "Kunde inte hitta butiker: " + storesResponse.status
      );
    }

    const storesData = await storesResponse.json();

    const selectedStores =
      storesData.default_selection ||
      storesData.stores?.default_selection ||
      [];

    // ------------------------------------------------------------
    // Om ingen produktfråga finns: returnera bara butiker
    // ------------------------------------------------------------
    if (!q) {
      return res.status(200).json({
        postcode,
        stores: storesData
      });
    }

    const stores = selectedStores.join(",");

    // ------------------------------------------------------------
    // Bestäm vilka sökningar vi ska göra
    //
    // Normalt gör vi bara en sökning.
    //
    // För vissa generiska varor där Primats första sökning
    // ofta hamnar fel kompletterar vi med mer specifika sökningar.
    // ------------------------------------------------------------
    const searches = [q];

    const normalizedQuery = q
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (
      normalizedQuery === "smor" ||
      normalizedQuery === "smör"
    ) {
      searches.push("smör normalsaltat");
      searches.push("smör 500g");
    }

    // ------------------------------------------------------------
    // Gör sökningarna
    // ------------------------------------------------------------
    const allProducts = [];

    for (const searchTerm of searches) {
      const productsUrl =
        "https://primat.nu/api/v3/demo/products?q=" +
        encodeURIComponent(searchTerm) +
        "&stores=" +
        encodeURIComponent(stores);

      const productsResponse = await fetch(productsUrl);

      if (!productsResponse.ok) {
        continue;
      }

      const productsData = await productsResponse.json();

      // Primat kan returnera en array eller ett objekt med products.
      let rows = [];

      if (Array.isArray(productsData)) {
        rows = productsData;
      } else if (Array.isArray(productsData.products)) {
        rows = productsData.products;
      } else if (Array.isArray(productsData.data)) {
        rows = productsData.data;
      }

      allProducts.push(...rows);
    }

    // ------------------------------------------------------------
    // Ta bort eventuella dubletter
    // ------------------------------------------------------------
    const seen = new Set();
    const products = [];

    for (const product of allProducts) {
      const key = [
        product.gtin || "",
        product.chain || "",
        product.store_id || "",
        product.product_id || "",
        product.id || "",
        product.name || ""
      ].join("|");

      if (!seen.has(key)) {
        seen.add(key);
        products.push(product);
      }
    }

    // ------------------------------------------------------------
    // Svara till Priskorgen
    // ------------------------------------------------------------
    return res.status(200).json({
      postcode,
      selected_stores: selectedStores,
      search_queries: searches,
      products
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
