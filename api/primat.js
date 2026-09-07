export default async function handler(req, res) {
  try {
    const q = req.query.q;
    const postcode = req.query.postcode || "89132";
    const apiKey = process.env.PRIMAT_API_KEY;

    if (!apiKey) {
      throw new Error("PRIMAT_API_KEY saknas i Vercel.");
    }

    // Hämta butiker utifrån postnummer
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

    // Om ingen sökning görs: returnera butiksinformationen
    if (!q) {
      return res.status(200).json({
        postcode,
        stores: storesData
      });
    }

    const stores = selectedStores.join(",");

    /*
      Primats vanliga sökning kan ge många träffar av samma typ.
      Därför gör vi flera breda sökningar för vanliga generiska
      produkter och slår sedan ihop resultaten.

      Vi filtrerar INTE bort produkter här.
      Primat får fortfarande leverera brett.
    */

    const searchVariants = [q];

    const normalizedQuery = q
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");

    const variantMap = {
      kaffe: [
        "bryggkaffe",
        "malet kaffe",
        "kokkaffe",
        "kaffebönor",
        "kaffekapslar"
      ],
      smör: [
        "smör normalsaltat",
        "smör extrasaltat",
        "smör osaltat"
      ],
      mjölk: [
        "mjölk",
        "standardmjölk",
        "mellanmjölk",
        "lättmjölk"
      ],
      bröd: [
        "bröd",
        "limpa",
        "formfranska",
        "rostbröd"
      ]
    };

    if (variantMap[normalizedQuery]) {
      searchVariants.push(...variantMap[normalizedQuery]);
    }

    // Ta bort eventuella dubletter
    const uniqueSearchVariants = [...new Set(searchVariants)];

    const results = await Promise.all(
      uniqueSearchVariants.map(async (searchTerm) => {
        const productsUrl =
          "https://primat.nu/api/v3/products?q=" +
          encodeURIComponent(searchTerm) +
          "&stores=" +
          encodeURIComponent(stores) +
          "&limit=100";

        const response = await fetch(productsUrl, {
          headers: {
            Authorization: "Bearer " + apiKey
          }
        });

        if (!response.ok) {
          return {
            products: [],
            error: "Sökning misslyckades för: " + searchTerm
          };
        }

        const data = await response.json();

        return {
          searchTerm,
          products: Array.isArray(data.products)
            ? data.products
            : Array.isArray(data)
              ? data
              : []
        };
      })
    );

    /*
      Slå ihop alla träffar.

      GTIN används i första hand för att identifiera samma produkt.
      Om GTIN saknas används namn + varumärke + förpackning.
    */

    const productMap = new Map();

    for (const result of results) {
      for (const product of result.products) {
        if (!product) continue;

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
            .join("|")
            .toLowerCase();

        if (!productMap.has(key)) {
          productMap.set(key, product);
        }
      }
    }

    const products = Array.from(productMap.values());

    return res.status(200).json({
      postcode,
      selected_stores: selectedStores,
      search_variants: uniqueSearchVariants,
      products,
      count: products.length
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
}
