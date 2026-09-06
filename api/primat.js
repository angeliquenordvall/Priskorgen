export default async function handler(req, res) {
  try {
    const q = req.query.q;
    const postcode = req.query.postcode || "89132";

    if (!q) {
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

      return res.status(200).json({
        postcode,
        stores: storesData
      });
    }

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

    const selectedStores = storesData.default_selection ||
      storesData.stores?.default_selection ||
      [];

    const stores = selectedStores.join(",");

    const productsUrl =
      "https://primat.nu/api/v3/demo/products?q=" +
      encodeURIComponent(q) +
      "&stores=" +
      encodeURIComponent(stores);

    const productsResponse = await fetch(productsUrl);

    if (!productsResponse.ok) {
      throw new Error(
        "Primat svarade med " + productsResponse.status
      );
    }

    const productsData = await productsResponse.json();

    return res.status(200).json({
      postcode,
      selected_stores: selectedStores,
      products: productsData
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
