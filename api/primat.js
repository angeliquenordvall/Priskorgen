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

    // TESTLÄGE:
    // ?catalog=1 hämtar första sidan från Primats fullständiga katalog.
    if (req.query.catalog === "1") {
      const stores = selectedStores.join(",");

      const pricesUrl =
        "https://primat.nu/api/v3/prices?stores=" +
        encodeURIComponent(stores) +
        "&limit=1000";

      const pricesResponse = await fetch(pricesUrl, {
        headers: {
          Authorization: "Bearer " + apiKey
        }
      });

      if (!pricesResponse.ok) {
        const errorText = await pricesResponse.text();

        throw new Error(
          "Primat kunde inte hämta katalogen (" +
            pricesResponse.status +
            "): " +
            errorText
        );
      }

      const pricesData = await pricesResponse.json();

      return res.status(200).json({
        postcode,
        selected_stores: selectedStores,
        catalog: pricesData
      });
    }

    if (!q) {
      return res.status(200).json({
        postcode,
        stores: storesData
      });
    }

    const stores = selectedStores.join(",");

    const productsUrl =
      "https://primat.nu/api/v3/products?q=" +
      encodeURIComponent(q) +
      "&stores=" +
      encodeURIComponent(stores) +
      "&limit=100";

    const productsResponse = await fetch(productsUrl, {
      headers: {
        Authorization: "Bearer " + apiKey
      }
    });

    if (!productsResponse.ok) {
      const errorText = await productsResponse.text();

      throw new Error(
        "Primat kunde inte hämta produkter (" +
          productsResponse.status +
          "): " +
          errorText
      );
    }

    const productsData = await productsResponse.json();

    return res.status(200).json({
      postcode,
      selected_stores: selectedStores,
      products: productsData
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
}
