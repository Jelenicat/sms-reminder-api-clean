// api/send-sms-reminders.js
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { addDays, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import twilio from "twilio";

// Firebase init
if (!getApps().length) {
  initializeApp({
    credential: cert({
      type: process.env.FIREBASE_TYPE,
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509,
      universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
    }),
  });
}

const db = getFirestore();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export default async function handler(req, res) {
  try {
    const now = new Date();
    const startNextWeek = addDays(startOfWeek(now, { weekStartsOn: 1 }), 7);
    const endNextWeek = endOfWeek(startNextWeek, { weekStartsOn: 1 });

    const snapshot = await db.collection("admin_kalendar")
      .where("tip", "==", "termin")
      .get();

    const termini = snapshot.docs.filter(doc => {
      const data = doc.data();
      return data.start && isWithinInterval(data.start.toDate(), {
        start: startNextWeek,
        end: endNextWeek
      });
    });

    const korisniciSnap = await db.collection("korisnici").get();
    const korisnici = Object.fromEntries(korisniciSnap.docs.map(doc => [doc.id, doc.data()]));

    for (const doc of termini) {
      const { clientUsername, start } = doc.data();
      const korisnik = korisnici[clientUsername];
      const broj = korisnik?.brojTelefona;

      if (broj) {
        await client.messages.create({
          body: `📅 Imate termin sledeće nedelje: ${start.toDate().toLocaleString("sr-RS")}`,
          from: process.env.TWILIO_PHONE,
          to: broj.startsWith("+") ? broj : `+381${broj}`
        });
        console.log(`✅ Poslato ${clientUsername} (${broj})`);
      }
    }

    res.status(200).json({ message: "SMS poruke poslate korisnicima sa terminima sledeće nedelje." });
  } catch (err) {
    console.error("❌ Greška:", err);
    res.status(500).json({ error: "Greška pri slanju poruka." });
  }
}
