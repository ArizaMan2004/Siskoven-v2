import { db } from "./firebase"
import { collection, query, where, getDocs, addDoc } from "firebase/firestore"

// Categorías del negocio. Se comparten entre todo el equipo, no por persona.
export async function getCategories(negocioId: string): Promise<string[]> {
  try {
    const categoriesRef = collection(db, "categorias")
    const q = query(categoriesRef, where("negocioId", "==", negocioId))
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
export async function addCategory(negocioId: string, categoryName: string) {
  try {
    const categoriesRef = collection(db, "categorias")
    await addDoc(categoriesRef, {
      negocioId,
      name: categoryName,
      createdAt: new Date(),
    })
  } catch (error) {
    console.error("Error adding category:", error)
    throw error
  }
}
