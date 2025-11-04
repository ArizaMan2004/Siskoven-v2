import { initializeApp } from "firebase/app"
import { getFirestore, collection, query, where, getDocs, addDoc } from "firebase/firestore"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const PREDEFINED_CATEGORIES = ["Víveres", "Ropa", "Accesorios", "Bebidas", "Charcutería"]

async function initializeCategories() {
  console.log("[v0] Starting category initialization...")

  try {
    // Get all users
    const usersRef = collection(db, "usuarios")
    const usersSnapshot = await getDocs(usersRef)

    console.log(`[v0] Found ${usersSnapshot.docs.length} users`)

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id
      console.log(`[v0] Processing user: ${userId}`)

      // Check if user already has categories
      const categoriesRef = collection(db, "categorias")
      const q = query(categoriesRef, where("userId", "==", userId))
      const categoriesSnapshot = await getDocs(q)

      if (categoriesSnapshot.empty) {
        console.log(`[v0] Creating predefined categories for user: ${userId}`)

        // Create predefined categories
        for (const category of PREDEFINED_CATEGORIES) {
          await addDoc(categoriesRef, {
            userId,
            name: category,
            isPredefined: true,
            createdAt: new Date(),
          })
          console.log(`[v0] Created category: ${category}`)
        }
      } else {
        console.log(`[v0] User ${userId} already has categories`)
      }
    }

    console.log("[v0] Category initialization completed successfully!")
  } catch (error) {
    console.error("[v0] Error during initialization:", error)
    process.exit(1)
  }
}

initializeCategories()
