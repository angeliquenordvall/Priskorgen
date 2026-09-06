export default async function handler(req, res) {
  try {
    const q = req.query.q || "mjölk";
    const postcode = req.query.postcode || "89132";

    const storesResponse = await fetch(
      "https://primat.nu/api/v3/demo/stores/resolve?place=" +
      encodeURIComponent(postcode)
    );

    if (!storesResponse.ok) {
      throw new Error(
        "Kunde inte hitta butiker: " +
        storesResponse.status
      );
    }

    const storesData = await storesResponse.json();

    res.status(200).json({
      postcode: postcode,
      stores: storesData
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }
}
