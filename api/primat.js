export default async function handler(req, res) {
  try {
    const q = req.query.q;
    const postcode = req.query.postcode || "89132";

    const apiKey = process.env.PRIMAT_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "PRIMAT_API_KEY saknas i Vercel."
      });
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`
    };

    // ------------------------------------------------------------
    // Hämta butiker för postnumret
    // ------------------------------------------------------------
    const storesResponse = await fetch(
      "https://primat.nu/api/v3/stores/resolve?postcode=" +
        encodeURIComponent(postcode),
      {
        headers
      }
    );

    if (!storesResponse.ok) {
      const errorText = await storesResponse.text();

      throw new Error(
        "Kunde inte hitta butiker: " +
          storesResponse.status +
          " " +
          errorText
      );
    }

    const storesData = await storesResponse.json();

    const selectedStores =
      storesData.default_selection || [];

    const stores = selectedStores.join(",");

    // ------------------------------------------------------------
    // Om ingen sökning finns:
    // returnera butiksinformationen
    // ------------------------------------------------------------
    if (!q) {
      return res.status(200).json({
        postcode,
        stores: storesData
      });
    }

    // ------------------------------------------------------------
    // Sök efter produkter
    //
    // Den riktiga API:n tillåter större resultatmängd än
    // demo-API:n. Vi använder 100 för att ge vår matchning
    // mycket bättre chans att hitta rätt produkt.
    // ------------------------------------------------------------
    const productsUrl =
      "https://primat.nu/api/v3/products?q=" +
      encodeURIComponent(q) +
      "&stores=" +
      encodeURIComponent(stores) +
      "&limit=100";

    const productsResponse = await fetch(productsUrl, {
      headers
    });

    if (!productsResponse.ok) {
      const errorText = await productsResponse.text();

      throw new Error(
        "Primat svarade med " +
          productsResponse.status +
          " " +
          errorText
      );
    }

    const productsData = await productsResponse.json();

    // Primats v3 returnerar produkterna i data[]
    const products = Array.isArray(productsData.data)
      ? productsData.data
      : [];

    // ------------------------------------------------------------
    // Returnera även Primats attribution.
    // ------------------------------------------------------------
    return res.status(200).json({
      postcode,
      selected_stores: selectedStores,
      query: q,
      count: products.length,
      products,
      attribution:
        productsData.attribution || {
          text: "Prisdata från primat.nu",
          url: "https://primat.nu"
        }
    });

  } catch (error) {
    console.error("Primat API error:", error);

    return res.status(500).json({
      error: error.message
    });
  }
}
