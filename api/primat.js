export default async function handler(req, res) {
  try {
    const q = req.query.q;
    const postcode = req.query.postcode || "89132";

    // Hämta närmaste relevanta butiker
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

    // Om ingen sökning görs – returnera butiksinformationen
    if (!q) {
      return res.status(200).json({
        postcode,
        stores: storesData
      });
    }

    const stores = selectedStores.join(",");

    /*
      Vissa vanliga produkter behöver flera sökningar eftersom
      Primats demo-sökning bara returnerar de 25 högst rankade
      träffarna.

      För "smör" letar vi därför även efter specifika varianter.
      Det gör att vanligt mat-smör kan hittas även om exempelvis
      smördeg, jordnötssmör och smörgåsmargarin rankas högre.
    */
    let searchQueries = [q];

    const normalizedQuery = q
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (
      normalizedQuery === "smor" ||
      normalizedQuery === "smör"
    ) {
      searchQueries = [
        "smör",
        "smör normalsaltat",
        "smör extrasaltat",
        "smör osaltat",
        "smör 82%"
      ];
    }

    // Kör sökningarna
    const allProducts = [];

    for (const searchQuery of searchQueries) {
      const productsUrl =
        "https://primat.nu/api/v3/demo/products?q=" +
        encodeURIComponent(searchQuery) +
        "&stores=" +
        encodeURIComponent(stores);

      const productsResponse = await fetch(productsUrl);

      if (!productsResponse.ok) {
        continue;
      }

      const productsData = await productsResponse.json();

      if (Array.isArray(productsData)) {
        allProducts.push(...productsData);
      } else if (Array.isArray(productsData.products)) {
        allProducts.push(...productsData.products);
      }
    }

    // Ta bort eventuella dubbletter
    const uniqueProducts = [];
    const seen = new Set();

    for (const product of allProducts) {
      const key =
        [
          product.chain,
          product.store_id,
          product.product_id,
          product.gtin,
          product.name
        ]
          .filter(Boolean)
          .join("|");

      if (!seen.has(key)) {
        seen.add(key);
        uniqueProducts.push(product);
      }
    }

    /*
      Extra backend-skydd för "smör":
      Vanligt smör ska inte förväxlas med exempelvis:
      - jordnötssmör
      - smörgåsmargarin
      - smördeg
      - kryddsmör
      - vitlökssmör
      - smörgåsfett
      - växtbaserat
    */
    if (
      normalizedQuery === "smor" ||
      normalizedQuery === "smör"
    ) {
      const ordinaryButter = uniqueProducts.filter((product) => {
        const text = [
          product.name,
          product.brand,
          product.category
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        const excluded = [
          "jordnotssmor",
          "smorgasmargarin",
          "smorgas",
          "margarin",
          "smordeg",
          "kryddsmor",
          "vitlokssmor",
          "smorja",
          "smorgasfett",
          "vaxtbaserat",
          "mjolkfritt"
        ];

        if (excluded.some((word) => text.includes(word))) {
          return false;
        }

        return (
          text.includes("smor") ||
          text.includes("butter")
        );
      });

      // Lägg de sannolika vanliga smörprodukterna först
      ordinaryButter.sort((a, b) => {
        const aText = (a.name || "").toLowerCase();
        const bText = (b.name || "").toLowerCase();

        const aPlain =
          aText.includes("smör") &&
          !aText.includes("smörgås") &&
          !aText.includes("jordnöt") &&
          !aText.includes("smördeg");

        const bPlain =
          bText.includes("smör") &&
          !bText.includes("smörgås") &&
          !bText.includes("jordnöt") &&
          !bText.includes("smördeg");

        return Number(bPlain) - Number(aPlain);
      });

      return res.status(200).json({
        postcode,
        selected_stores: selectedStores,
        products: ordinaryButter
      });
    }

    return res.status(200).json({
      postcode,
      selected_stores: selectedStores,
      products: uniqueProducts
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
