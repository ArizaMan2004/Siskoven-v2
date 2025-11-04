import { db } from "./firebase"
import { collection, query, where, getDocs, addDoc } from "firebase/firestore"

// Obtener todas las categorías del usuario
export async function getCategories(userId: string): Promise<string[]> {
  try {
    const categoriesRef = collection(db, "categorias")
    const q = query(categoriesRef, where("userId", "==", userId))
    const snapshot = await getDocs(q)

    // Devuelve solo los nombres, ordenados alfabéticamente
    return snapshot.docs
      .map((doc) => doc.data().name as string)
      .sort((a, b) => a.localeCompare(b))
  } catch (error) {
    console.error("Error fetching categories:", error)
    return []
  }
}

// Agregar una nueva categoría personalizada
export async function addCategory(userId: string, categoryName: string) {
  try {
    const categoriesRef = collection(db, "categorias")
    await addDoc(categoriesRef, {
      userId,
      name: categoryName,
      createdAt: new Date(),
    })
  } catch (error) {
    console.error("Error adding category:", error)
    throw error
  }
}
