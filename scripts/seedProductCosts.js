import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCTQur3QQtoD9Ji6my9WpW-MtI0xBAmRng",
  authDomain: "kazi-manufacturing.firebaseapp.com",
  projectId: "kazi-manufacturing",
  storageBucket: "kazi-manufacturing.firebasestorage.app",
  messagingSenderId: "587869032874",
  appId: "1:587869032874:web:18d9f44ec05a09dcd39bd3",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const PRODUCTS = [
  { code: "kazi1001", name: "Chinese Terry Tshirt (White)", fabric: 402, rib: 22, trims: 16, labour: 75, others: 20 },
  { code: "kazi1002", name: "Chinese Terry Tshirt (Black)", fabric: 307, rib: 22, trims: 16, labour: 75, others: 20 },
  { code: "kazi1003", name: "Cotton Terry",                  fabric: 360, rib: 22, trims: 16, labour: 75, others: 20 },
  { code: "kazi1004", name: "Lining Cotton Terry",           fabric: 0,   rib: 22, trims: 20, labour: 75, others: 20 },
  { code: "kazi1005", name: "Combed Cotton",                 fabric: 290, rib: 22, trims: 20, labour: 75, others: 20 },
  { code: "kazi1006", name: "Ligra",                         fabric: 160, rib: 22, trims: 20, labour: 75, others: 20 },
];

for (const p of PRODUCTS) {
  const total = p.fabric + p.rib + p.trims + p.labour + p.others;
  await setDoc(doc(db, "product_costs", p.code), {
    ...p,
    total,
    updatedAt: new Date().toISOString(),
  });
  console.log(`✓ ${p.code} — ${p.name} (₨${total})`);
}

console.log("Done.");
process.exit(0);
