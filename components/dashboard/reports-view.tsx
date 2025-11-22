// reports-view.tsx

"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input" 
import { Label } from "@/components/ui/label" 
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table" 
// Importaciones de iconos y animación
import { FileText, Download, Settings, Upload, Loader2, RefreshCw, Tag, DollarSign, Euro, ChevronLeft, ChevronRight } from "lucide-react" // 🔑 Añadidos ChevronLeft/Right para paginación
import { motion } from "framer-motion"
// import { toast } from "sonner" 

// 🔑 IMPORTACIÓN FUNCIONAL
import { generateInventoryReport, generateInvoice, generateProductLabels, BusinessInfo, Sale as SaleInterface } from "@/lib/pdf-generator" 
// 🔑 NUEVAS IMPORTACIONES: Funciones de servicio BCV
import { getBCVRate, fetchBCVRateFromAPI } from "@/lib/bcv-service" 


// Componente Select personalizado para estilo
const Select = ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select 
        {...props} 
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
        {children}
    </select>
);

// 🔑 CONSTANTE DE BANCOS
const VENEZUELAN_BANKS = [
    { code: "0102", name: "Banco de Venezuela, S.A. Banco Universal" },
    { code: "0105", name: "Banco Mercantil, C.A. Banco Universal" },
    { code: "0108", name: "Banco Provincial, S.A. Banco Universal" },
    { code: "0134", name: "Banesco Banco Universal, C.A." },
    { code: "0191", name: "Banco Nacional de Crédito, BNC" },
    // ... (otros bancos, truncados por espacio)
];

// 🔑 CONSTANTE PARA EL FILTRO DE MÉTODOS DE PAGO (NUEVO)
const PAYMENT_METHODS = [
  { value: "all", label: "Todos los Métodos" },
  { value: "cash", label: "Efectivo (USD)" },
  { value: "zelle", label: "Zelle" },
  { value: "binance", label: "Binance" },
  { value: "debit", label: "Débito" },
  { value: "transfer", label: "Transferencia" },
  { value: "pagoMovil", label: "Pago Móvil" },
  { value: "biopago", label: "Biopago" },
  { value: "mixed", label: "Pago Mixto" },
];

// ----------------------------------------------------------------------
// LOCAL LOGO SERVICE UTILITIES (Se mantiene la lógica funcional)
// ----------------------------------------------------------------------
const LOCAL_STORAGE_KEY = 'businessLogoBase64';
const MAX_WIDTH = 100;
const MAX_HEIGHT = 100;
const COMPRESSION_QUALITY = 0.8;
const TARGET_MIME_TYPE = 'image/jpeg'; 

function loadLogoLocally(): string | null {
    if (typeof window !== "undefined") {
        try {
            return localStorage.getItem(LOCAL_STORAGE_KEY);
        } catch(e) { return null; }
    }
    return null;
}

function saveLogoLocally(base64String: string): void {
    if (typeof window !== "undefined") {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, base64String);
        } catch(e) { console.error("Error saving logo to localStorage", e); }
    }
}

function processLogoFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            reject(new Error("El procesamiento de la imagen solo puede ejecutarse en el navegador."));
            return;
        }

        const reader = new FileReader();
        reader.onload = (readerEvent) => {
            const dataURL = readerEvent.target?.result as string;
            const img = new Image();
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }

                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                const resizedBase64 = canvas.toDataURL(TARGET_MIME_TYPE, COMPRESSION_QUALITY);
                resolve(resizedBase64);
            };
            
            img.onerror = () => reject(new Error("Error al cargar la imagen."));
            img.src = dataURL;
        };
        
        reader.onerror = () => reject(new Error("Error al leer el archivo."));
        reader.readAsDataURL(file);
    });
}
// ----------------------------------------------------------------------

// Interfaces (Se mantienen y se añade la corrección)
interface Product { 
  id: string
  name: string
  category: string
  costUsd: number
  quantity: number
  profit: number
  saleType: "unit" | "weight" | "area"
  barcode?: string
}

interface Sale extends SaleInterface {
    items: any[]; 
    createdAt: { toDate: () => Date };
    paymentMethod?: string;
    paymentMethodDescription?: string; 
    totalUsd: number;
    totalBs: number;
    bcvRate: number;
    clientInfo: {
      name: string;
      document: string;
      phone: string;
      address: string;
    } | null;
}

interface FullBusinessInfo {
    businessName: string; 
    businessType: string;
    logoBase64: string;
    fiscalAddress: string;
    fiscalDocumentPrefix: "V" | "E" | "P" | "R" | "J" | "G" | string;
    fiscalDocumentNumber: string; 
    phoneNumberPrefix: "0414" | "0422" | "0412" | "0424" | "0416" | "0426" | string;
    phoneNumberNumber: string;
    phoneNumber: string; 
    fiscalDocument: string; 
    email: string;
    bankName: string; 
    bankAccountOwner: string;
    bankAccountNumber: string;
}

const defaultBusinessInfo: FullBusinessInfo = {
    businessName: "",
    businessType: "",
    logoBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    fiscalAddress: "",
    fiscalDocumentPrefix: "J", 
    fiscalDocumentNumber: "", 
    phoneNumberPrefix: "0414", 
    phoneNumberNumber: "",
    phoneNumber: "", 
    fiscalDocument: "", 
    email: "", 
    bankName: "", 
    bankAccountOwner: "", 
    bankAccountNumber: "", 
}

// ----------------------------------------------------------------------
// COMPONENTE BusinessConfigModal
// ----------------------------------------------------------------------
interface BusinessConfigModalProps {
    isConfigModalOpen: boolean;
    setIsConfigModalOpen: (isOpen: boolean) => void;
    formInfo: FullBusinessInfo;
    handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    saveBusinessInfo: (e: React.FormEvent) => Promise<void>;
    isSaving: boolean;
}

const BusinessConfigModal = ({ 
    isConfigModalOpen, 
    setIsConfigModalOpen, 
    formInfo, 
    handleChange, 
    saveBusinessInfo, 
    isSaving 
}: BusinessConfigModalProps) => {

    if (!isConfigModalOpen) return null; 

    const rifPrefixes = ["V", "E", "P", "R", "J", "G"];
    const phonePrefixes = ["0412", "0422", "0414", "0424", "0416", "0426"];

    return (
        <div className={`fixed inset-0 z-50 bg-black/50 flex justify-center items-center backdrop-blur-sm`}>
            <div className className="bg-background rounded-xl shadow-2xl border border-border w-11/12 md:w-3/4 max-w-3xl max-h-[90vh] overflow-y-auto">
              
                <div className="p-6">
                    <h3 className="text-2xl font-bold mb-4 border-b pb-2">Configuración Fiscal y Bancaria</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      Actualiza los datos que aparecerán en tus notas de entrega y reportes.
                    </p>
                    
                    <form onSubmit={saveBusinessInfo} className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        
                        {/* SECCIÓN 1: GENERAL Y FISCAL */}
                        <div className="md:col-span-2">
                            <h4 className="font-semibold text-base mb-2 text-primary">Información General y Fiscal</h4>
                            <hr className="mb-4" />
                        </div>
                        
                        <div className="space-y-2"><Label htmlFor="businessName">Nombre del Negocio</Label><Input id="businessName" value={formInfo.businessName} onChange={handleChange} required /></div>
                        <div className="space-y-2"><Label htmlFor="businessType">Tipo de Negocio</Label><Input id="businessType" value={formInfo.businessType} onChange={handleChange} placeholder="Ej: Venta de Ropa" /></div>
                        
                        {/* CAMPO RIF/CÉDULA DIVIDIDO */}
                        <div className="space-y-2">
                            <Label htmlFor="fiscalDocumentNumber">RIF / Cédula Fiscal</Label>
                            <div className="flex gap-2">
                                <Select
                                    id="fiscalDocumentPrefix"
                                    value={formInfo.fiscalDocumentPrefix}
                                    onChange={handleChange}
                                    className="w-1/4"
                                >
                                    {rifPrefixes.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </Select>
                                <Input 
                                    id="fiscalDocumentNumber" 
                                    value={formInfo.fiscalDocumentNumber} 
                                    onChange={handleChange} 
                                    placeholder="Número (ej: 12345678)"
                                    className="w-3/4"
                                    required 
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-2"><Label htmlFor="fiscalAddress">Dirección Fiscal</Label><Input id="fiscalAddress" value={formInfo.fiscalAddress} onChange={handleChange} required /></div>

                        {/* SECCIÓN 2: CONTACTO */}
                        <div className="md:col-span-2">
                            <h4 className="font-semibold text-base mt-4 mb-2 text-primary">Contacto</h4>
                            <hr className="mb-4" />
                        </div>
                        
                        {/* CAMPO TELÉFONO DIVIDIDO */}
                        <div className="space-y-2">
                            <Label htmlFor="phoneNumberNumber">Teléfono</Label>
                            <div className="flex gap-2">
                                <Select
                                    id="phoneNumberPrefix"
                                    value={formInfo.phoneNumberPrefix}
                                    onChange={handleChange}
                                    className="w-1/3"
                                >
                                    {phonePrefixes.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </Select>
                                <Input 
                                    id="phoneNumberNumber" 
                                    value={formInfo.phoneNumberNumber} 
                                    onChange={handleChange} 
                                    placeholder="Número (ej: 1234567)"
                                    className="w-2/3"
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-2"><Label htmlFor="email">Correo Electrónico</Label><Input id="email" type="email" value={formInfo.email} onChange={handleChange} /></div>
                        
                        {/* SECCIÓN 3: DATOS BANCARIOS */}
                        <div className="md:col-span-2">
                            <h4 className="font-semibold text-base mt-4 mb-2 text-primary">Datos Bancarios</h4>
                            <hr className="mb-4" />
                        </div>
                        
                        {/* CAMPO NOMBRE DEL BANCO COMO SELECT ENUM */}
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="bankName">Nombre del Banco</Label>
                          <Select id="bankName" value={formInfo.bankName} onChange={handleChange}>
                              <option value="" disabled>Selecciona un banco...</option>
                              {VENEZUELAN_BANKS.map(bank => (
                                  <option key={bank.code} value={`${bank.code} - ${bank.name}`}>
                                      {bank.code} - {bank.name}
                                  </option>
                              ))}
                          </Select>
                        </div>
                        
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="bankAccountNumber">Número de Cuenta</Label>
                          <Input id="bankAccountNumber" value={formInfo.bankAccountNumber} onChange={handleChange} />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="bankAccountOwner">Nombre del Titular de la Cuenta (Opcional)</Label>
                          <Input id="bankAccountOwner" value={formInfo.bankAccountOwner} onChange={handleChange} />
                        </div>
                        
                        {/* Botones de acción */}
                        <div className="md:col-span-2 flex justify-end gap-2 pt-8 border-t">
                            <Button 
                              type="button" 
                              variant="outline" 
                              onClick={() => setIsConfigModalOpen(false)}
                              disabled={isSaving}
                            >
                              Cancelar
                            </Button>
                            <Button type="submit" className="gap-2" disabled={isSaving}>
                              {isSaving ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                              ) : "Guardar Información Fiscal"}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// 🔑 COMPONENTE PRINCIPAL (ReportsView)
// ----------------------------------------------------------------------

// 💡 FUNCIÓN AUXILIAR DE VISUALIZACIÓN
const getDisplayPaymentMethod = (sale: Sale): string => {
    // 1. Priorizar el nuevo campo descriptivo (para ventas nuevas)
    if (sale.paymentMethodDescription) {
        return sale.paymentMethodDescription;
    }
    
    // 2. Si es una venta antigua con pago mixto, mostrar un mensaje útil
    if (sale.paymentMethod === 'mixed') {
        return 'Mixto (Detalle no guardado)'; 
    }
    
    // 3. Si no, usar el campo paymentMethod original con traducción simple
    switch (sale.paymentMethod) {
        case 'cash': return 'Efectivo (USD)';
        case 'zelle': return 'Zelle';
        case 'binance': return 'Binance';
        case 'debit': return 'Débito';
        case 'transfer': return 'Transferencia';
        case 'pagoMovil': return 'Pago Móvil';
        case 'biopago': return 'Biopago';
        default: return sale.paymentMethod || 'N/A';
    }
}


export default function ReportsView() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [businessName, setBusinessName] = useState(defaultBusinessInfo.businessName) 
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false) 
  const [isGenerating, setIsGenerating] = useState(false) 
  
  // 🔑 NUEVOS ESTADOS PARA FILTRO Y PAGINACIÓN
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterMethod, setFilterMethod] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const salesPerPage = 10; // Ventas por página
  
  // Estado que contiene la tasa BCV real
  const [currentBcvRate, setCurrentBcvRate] = useState<number>(0) 
  // 🔑 NUEVO ESTADO: Para el loader del botón de actualización de la tasa
  const [rateIsUpdating, setRateIsUpdating] = useState(false) 
  
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false); 

  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({
      logoBase64: defaultBusinessInfo.logoBase64,
      fiscalAddress: defaultBusinessInfo.fiscalAddress,
      fiscalDocument: "", 
      phoneNumber: "", 
      email: defaultBusinessInfo.email,
      bankName: defaultBusinessInfo.bankName,
      bankAccountOwner: defaultBusinessInfo.bankAccountOwner,
      bankAccountNumber: defaultBusinessInfo.bankAccountNumber,
      businessName: defaultBusinessInfo.businessName, 
  });
  
  const [formInfo, setFormInfo] = useState<FullBusinessInfo>(defaultBusinessInfo);
  
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      loadData()
    }
  }, [user])
  
  // 🔑 FUNCIÓN: Actualización manual de la tasa BCV
  const handleRefreshRate = async () => {
    setRateIsUpdating(true);
    try {
        const newRateData = await fetchBCVRateFromAPI(); 
        
        if (newRateData && newRateData.rate > 0) {
            setCurrentBcvRate(newRateData.rate);
            // toast.success(`Tasa BCV actualizada a Bs. ${newRateData.rate.toFixed(2)}`); 
            alert(`Tasa BCV actualizada a Bs. ${newRateData.rate.toFixed(2)}`); 
        } else {
            // toast.error("Error al obtener la tasa BCV. Intenta de nuevo."); 
            alert("Error al obtener la tasa BCV. Intenta de nuevo.");
        }
    } catch (error) {
        console.error("Error fetching BCV rate:", error);
        // toast.error("Error de conexión al actualizar la tasa BCV."); 
        alert("Error de conexión al actualizar la tasa BCV.");
    } finally {
        setRateIsUpdating(false);
    }
  }


  const loadData = async () => {
    if (!user) return
    setLoading(true)
    try {
      const userDocRef = doc(db, "usuarios", user.uid);
      const userDoc = await getDoc(userDocRef);

      const loadedBusinessInfo: FullBusinessInfo = { ...defaultBusinessInfo };
      let finalBusinessInfo: BusinessInfo = { ...businessInfo };

      if (userDoc.exists()) {
        const data = userDoc.data();
        
        loadedBusinessInfo.businessName = (data.businessName as string) || "";
        loadedBusinessInfo.businessType = (data.businessType as string) || "";
        
        const localLogo = loadLogoLocally();
        if (localLogo) {
            loadedBusinessInfo.logoBase64 = localLogo;
        } else {
            loadedBusinessInfo.logoBase64 = (data.logoBase64 as string) || defaultBusinessInfo.logoBase64;
        }

        loadedBusinessInfo.fiscalAddress = (data.fiscalAddress as string) || "";
        loadedBusinessInfo.email = (data.email as string) || "";
        loadedBusinessInfo.bankName = (data.bankName as string) || "";
        loadedBusinessInfo.bankAccountOwner = (data.bankAccountOwner as string) || "";
        loadedBusinessInfo.bankAccountNumber = (data.bankAccountNumber as string) || "";

        const savedFiscalDocument = (data.fiscalDocument as string) || "";
        const rifPrefixes = ["V", "E", "P", "R", "J", "G"];
        const rifMatch = savedFiscalDocument.match(/^([VEPRJG])(.+)/i);
        
        if (rifMatch && rifPrefixes.includes(rifMatch[1].toUpperCase())) {
            loadedBusinessInfo.fiscalDocumentPrefix = rifMatch[1].toUpperCase() as typeof loadedBusinessInfo.fiscalDocumentPrefix;
            loadedBusinessInfo.fiscalDocumentNumber = rifMatch[2].replace(/[^0-9]/g, ''); 
        } else {
            loadedBusinessInfo.fiscalDocumentPrefix = defaultBusinessInfo.fiscalDocumentPrefix;
            loadedBusinessInfo.fiscalDocumentNumber = "";
        }

        const savedPhoneNumber = (data.phoneNumber as string) || "";
        const phonePrefixes = ["0412", "0422", "0414", "0424", "0416", "0426"];
        
        const matchingPrefix = phonePrefixes.find(p => savedPhoneNumber.startsWith(p));
        
        if (matchingPrefix) {
            loadedBusinessInfo.phoneNumberPrefix = matchingPrefix;
            loadedBusinessInfo.phoneNumberNumber = savedPhoneNumber.substring(matchingPrefix.length).replace(/[^0-9]/g, '');
        } else {
            loadedBusinessInfo.phoneNumberPrefix = defaultBusinessInfo.phoneNumberPrefix;
            loadedBusinessInfo.phoneNumberNumber = "";
        }
        
        finalBusinessInfo = {
            ...loadedBusinessInfo,
            fiscalDocument: savedFiscalDocument, 
            phoneNumber: savedPhoneNumber,
            bankName: loadedBusinessInfo.bankName, 
        } as BusinessInfo;
      }
      
      setBusinessName(loadedBusinessInfo.businessName);
      setBusinessInfo(finalBusinessInfo);
      setFormInfo(loadedBusinessInfo); 

      // 🔑 CARGAR TASA INICIAL DEL SERVICIO (si está disponible)
      const initialRateData = getBCVRate();
      setCurrentBcvRate(initialRateData.rate || 0);

      // Cargar Productos y Ventas (filtradas por userId)
      const productsQuery = query(collection(db, "productos"), where("userId", "==", user.uid))
      const productsSnapshot = await getDocs(productsQuery)
      const productsData = productsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), })) as Product[]
      setProducts(productsData)

      const salesQuery = query(collection(db, "ventas"), where("userId", "==", user.uid))
      const salesSnapshot = await getDocs(salesQuery)
      
      const salesData = salesSnapshot.docs.map((doc) => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data, 
          totalBs: Number(data.totalBs || 0), 
          totalUsd: Number(data.totalUsd || 0),
          bcvRate: Number(data.bcvRate || 0),
          clientInfo: data.clientInfo || null, 
          cart: data.items || [], 
          paymentMethod: data.paymentMethod || 'N/A', 
          paymentMethodDescription: data.paymentMethodDescription || undefined, 
        }
      }) as Sale[]
      
      // @ts-ignore: se asume que createdAt existe y tiene la función toDate()
      const sortedSales = salesData.sort((a, b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime())
      setSales(sortedSales)

    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    let newValue = value;
    
    if (id === 'fiscalDocumentNumber' || id === 'phoneNumberNumber' || id === 'bankAccountNumber') {
      newValue = value.replace(/[^0-9]/g, ''); 
    }
    
    setFormInfo((prev) => ({
      ...prev,
      [id]: newValue, 
    }));
  };
  
  const triggerLogoInput = () => {
    logoInputRef.current?.click();
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5242880) { // Límite 5MB
        alert("El archivo es demasiado grande. Por favor, selecciona una imagen menor a 5MB.");
        e.target.value = "";
        return;
    }

    setRateIsUpdating(true); // Usamos este estado para mostrar carga

    // 🔑 Procesar imagen, guardar localmente y actualizar estados
    processLogoFile(file)
        .then((base64String) => {
            // 1. Guardar Base64 optimizado en Local Storage (Gestión Local)
            saveLogoLocally(base64String); 

            // 2. Actualizar los estados del componente
            setFormInfo((prev) => ({
                ...prev,
                logoBase64: base64String,
            }));
            setBusinessInfo((prev) => ({
                ...prev,
                logoBase64: base64String,
            }));
            
            alert("Logo cargado, optimizado y guardado de manera local en tu navegador.");
        })
        .catch((error) => {
            console.error("Error al procesar el logo:", error);
            alert("Error al procesar la imagen. Revisa la consola.");
        })
        .finally(() => {
            setRateIsUpdating(false);
            e.target.value = ""; // Limpiar el input
        });
  };
  
  const saveBusinessInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);

    const finalFiscalDocument = `${formInfo.fiscalDocumentPrefix}${formInfo.fiscalDocumentNumber.replace(/[^0-9]/g, '')}`;
    const finalPhoneNumber = `${formInfo.phoneNumberPrefix}${formInfo.phoneNumberNumber.replace(/[^0-9]/g, '')}`;

    const dataToSave = {
      businessName: formInfo.businessName,
      fiscalAddress: formInfo.fiscalAddress,
      fiscalDocument: finalFiscalDocument, 
      phoneNumber: finalPhoneNumber,
      email: formInfo.email,
      bankName: formInfo.bankName, 
      bankAccountOwner: formInfo.bankAccountOwner,
      bankAccountNumber: formInfo.bankAccountNumber,
      businessType: formInfo.businessType,
      // logoBase64 NO se guarda aquí, ya que se gestiona localmente.
    };

    try {
      const userDocRef = doc(db, "usuarios", user.uid);
      await updateDoc(userDocRef, dataToSave);
      
      setBusinessName(dataToSave.businessName);
      setBusinessInfo(prev => ({ 
          ...prev, 
          ...dataToSave, 
      })); 
      
      setIsConfigModalOpen(false); 

      alert("¡Información de la empresa guardada con éxito!");

    } catch (error) {
      console.error("Error al guardar la información de la empresa:", error);
      alert("Error al guardar. Revisa la consola para más detalles.");
    } finally {
      setIsSaving(false);
    }
  };


  const handleGenerateInventoryReport = async () => {
    if (currentBcvRate === 0) {
        alert("La tasa BCV no se ha cargado correctamente.");
        return;
    }
    setIsGenerating(true);
    try {
        // 🔑 MODIFICACIÓN CLAVE: Pasamos businessInfo en lugar de businessName
        await generateInventoryReport(products, businessInfo, currentBcvRate) 
    } catch (error) {
        console.error("Error generating report:", error);
    } finally {
        setIsGenerating(false);
    }
  }

  const handleGenerateLabels = async () => {
    if (currentBcvRate === 0) {
        alert("La tasa BCV no se ha cargado correctamente.");
        return;
    }
    setIsGenerating(true);
    try {
        await generateProductLabels(products, currentBcvRate) 
    } catch (error) {
         console.error("Error generating labels:", error);
    } finally {
        setIsGenerating(false);
    }
  }

// 🔑 CORRECCIÓN CLAVE: Función para generar nota de entrega (anteriormente factura)
  const handleGenerateInvoice = (sale: Sale) => {
      
    // 🔑 MODIFICACIÓN CLAVE: Usar el método descriptivo en la factura
    const saleWithDescription = {
        ...sale,
        // Usar la descripción si existe, sino el método simple (obtenido de la función auxiliar)
        paymentMethod: getDisplayPaymentMethod(sale)
    }
    
    // El nombre de la función subyacente (generateInvoice) se mantiene por dependencia.
    generateInvoice( 
        businessInfo, 
        saleWithDescription
    )
  }

  // ---------------------------------------------------------------------------------------
  // 🔑 LÓGICA DE FILTRADO, ORDENAMIENTO Y PAGINACIÓN (NUEVO)
  // ---------------------------------------------------------------------------------------
  const filteredSales = sales
    // 1. Filtrado por fecha y método
    .filter((sale) => {
      // @ts-ignore: createdAt existe y tiene toDate()
      const saleDate = sale.createdAt.toDate().toISOString().split("T")[0] 
      const matchesFrom = !dateFrom || saleDate >= dateFrom
      const matchesTo = !dateTo || saleDate <= dateTo
      
      const matchesMethod = filterMethod === "all" || sale.paymentMethod === filterMethod;
      
      return matchesFrom && matchesTo && matchesMethod
    })
    // 2. Ordenamiento: Más reciente primero (DESCENDENTE)
    .sort((a, b) => {
      // @ts-ignore: createdAt existe y tiene toDate()
      const dateA = a.createdAt.toDate().getTime();
      // @ts-ignore: createdAt existe y tiene toDate()
      const dateB = b.createdAt.toDate().getTime();
      return dateB - dateA; // Ordenamiento de más reciente a más antigua
    });
  
  // 3. LÓGICA DE PAGINACIÓN
  const indexOfLastSale = currentPage * salesPerPage;
  const indexOfFirstSale = indexOfLastSale - salesPerPage;
  const currentSalesForTable = filteredSales.slice(indexOfFirstSale, indexOfLastSale);
  const totalPages = Math.ceil(filteredSales.length / salesPerPage);

  const paginate = (pageNumber: number) => {
      if (pageNumber > 0 && pageNumber <= totalPages) {
          setCurrentPage(pageNumber);
      }
  };
  // ---------------------------------------------------------------------------------------


  if (loading) {
    return <div className="text-center py-8 flex justify-center items-center"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando reportes...</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="p-4 md:p-8 space-y-8"
    >
      {/* MODAL DE CONFIGURACIÓN */}
      <BusinessConfigModal 
          isConfigModalOpen={isConfigModalOpen}
          setIsConfigModalOpen={setIsConfigModalOpen}
          formInfo={formInfo}
          handleChange={handleChange}
          saveBusinessInfo={saveBusinessInfo}
          isSaving={isSaving}
      />
      
      {/* ------------------------------------------- */}
      {/* ENCABEZADO Y CONTROLES */}
      {/* ------------------------------------------- */}
      <div className="flex justify-between items-center"> 
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Reportes de {businessName || 'Ventas'}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión y descarga de reportes y notas de entrega en formato PDF.
          </p>
        </div>
        
        {/* GRUPO DE ACCIONES DE CONFIGURACIÓN */}
        <div className="flex gap-2">
            
            {/* Botón de Configuración */}
            <Button 
                onClick={() => setIsConfigModalOpen(true)}
                size="icon" 
                variant="outline" 
                title="Configuración Fiscal y Bancaria"
            >
                <Settings className="w-5 h-5" />
            </Button>
            
            {/* Botón para subir el Logo */}
            <Button 
                onClick={triggerLogoInput} 
                size="icon" 
                variant="outline"
                title="Subir Logo para Notas de Entrega"
            >
                <Upload className="w-5 h-5" />
            </Button>
            
            {/* Input de archivo OCULTO */}
            <input 
                id="logoFile"
                type="file"
                accept="image/png, image/jpeg"
                ref={logoInputRef}
                onChange={handleLogoUpload}
                className="hidden" 
            />
        </div>
      </div>
      
      {/* ------------------------------------------- */}
      {/* MÉTRICAS PRINCIPALES */}
      {/* ------------------------------------------- */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        
        {/* Card 1: Tasa de Cambio BCV */}
        <Card className={`shadow-lg border ${currentBcvRate > 0 ? "border-green-300" : "border-red-300"}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tasa BCV del Día</CardTitle>
                <Button 
                    onClick={handleRefreshRate} 
                    size="icon" 
                    variant="ghost" 
                    title="Actualizar Tasa BCV"
                    disabled={rateIsUpdating}
                >
                    <RefreshCw className={`w-4 h-4 text-muted-foreground transition-all ${rateIsUpdating ? "animate-spin text-primary" : "hover:text-primary"}`} />
                </Button>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-primary">
                    {currentBcvRate > 0 ? `Bs ${currentBcvRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Cargando..."}
                </div>
                <p className={`text-xs ${currentBcvRate > 0 ? "text-green-600" : "text-red-500"} mt-1`}>
                    {currentBcvRate > 0 ? "Última Tasa Operativa" : "Tasa no cargada. Actualiza."}
                </p>
            </CardContent>
        </Card>
        
        {/* Card 2: Items en Stock */}
        <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Items en Stock</CardTitle>
                <Tag className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{products.length}</div>
                <p className="text-xs text-muted-foreground mt-1">Productos únicos</p>
            </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------- */}
      {/* SECCIÓN DE GENERACIÓN DE REPORTES */}
      {/* ------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4"> 
        
        {/* REPORTES DE INVENTARIO */}
        <Card className="shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between px-6 pt-6">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <FileText className="w-5 h-5 text-primary" />
              Reporte de Inventario
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-sm text-muted-foreground mb-4">
              Descarga un reporte completo de tu inventario actual con precios en USD y Bs, basado en la Tasa BCV cargada.
            </p>
            <Button 
                onClick={handleGenerateInventoryReport} 
                className="w-full gap-2 bg-primary hover:bg-primary/90"
                disabled={isGenerating || currentBcvRate === 0}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {currentBcvRate === 0 ? "Cargando Tasa BCV..." : "Descargar Inventario PDF"}
            </Button>
          </CardContent>
        </Card>

        {/* ETIQUETAS DE PRODUCTO */}
        <Card className="shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between px-6 pt-6">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <FileText className="w-5 h-5 text-accent" />
              Etiquetas de Productos
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-sm text-muted-foreground mb-4">
              Genera etiquetas imprimibles con los precios de tus productos. Ideal para stock y exhibición.
            </p>
            <Button 
                onClick={handleGenerateLabels} 
                className="w-full gap-2 bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={isGenerating || currentBcvRate === 0} 
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {currentBcvRate === 0 ? "Cargando Tasa BCV..." : "Generar Etiquetas"}
            </Button>
          </CardContent>
        </Card>
      </div>
      
      {/* ------------------------------------------- */}
      {/* CONTROLES DE FILTRO (NUEVO) */}
      {/* ------------------------------------------- */}
      <div className="flex flex-col md:flex-row gap-4 mb-6 pt-4">
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} 
          placeholder="Desde"
          className="w-full md:w-auto"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} 
          placeholder="Hasta"
          className="w-full md:w-auto"
        />
        {/* Filtro por Método de Pago */}
        <Select
          value={filterMethod}
          onChange={(e) => { setFilterMethod(e.target.value); setCurrentPage(1); }} 
          className="w-full md:w-60"
        >
          {PAYMENT_METHODS.map(method => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </Select>
      </div>

      {/* ------------------------------------------- */}
      {/* HISTORIAL DE VENTAS (TABLA CON PAGINACIÓN Y FILTROS) */}
      {/* ------------------------------------------- */}
      <Card className="shadow-xl mt-8">
        <CardHeader className="px-6 pt-6">
          <CardTitle className="text-xl font-semibold">Historial de Ventas</CardTitle>
          <p className="text-sm text-muted-foreground">Ventas recientes para generar notas de entrega.</p>
        </CardHeader>
        <CardContent className="p-0">
          {filteredSales.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No hay ventas registradas con los filtros actuales</p>
          ) : (
            <>
              {/* Vista de tarjetas para móvil */}
              <div className="lg:hidden space-y-4 p-4">
                {currentSalesForTable.map((sale) => (
                  // @ts-ignore: createdAt es un Timestamp de Firestore
                  <Card key={sale.id} className="shadow-sm border-l-4 border-primary/60 p-4 space-y-2">
                    <div className="flex justify-between items-start mb-2 border-b pb-2">
                      <span className="text-base font-bold">
                         {/* @ts-ignore: createdAt es un Timestamp de Firestore */}
                        Venta del {new Date(sale.createdAt.toDate()).toLocaleDateString("es-VE")}
                      </span>
                      <span className="text-xs bg-secondary px-3 py-1 rounded-full font-medium">{getDisplayPaymentMethod(sale)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Método de Pago:</span>
                      <span className="font-semibold text-gray-700">{getDisplayPaymentMethod(sale)}</span>
                    </div>

                    <Button
                      onClick={() => handleGenerateInvoice(sale)}
                      size="sm"
                      variant="outline"
                      className="w-full gap-1 mt-4"
                      disabled={currentBcvRate === 0}
                    >
                      <Download className="w-4 h-4" />
                      Descargar Nota de Entrega 
                    </Button>
                  </Card>
                ))}
              </div>

              {/* Vista de tabla para desktop */}
              <div className="hidden lg:block overflow-x-auto">
                <Table className="w-full text-sm">
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="text-left py-4 px-6 font-semibold">Fecha</TableHead>
                      <TableHead className="text-left py-4 px-6 font-semibold">Método de Pago</TableHead>
                      <TableHead className="text-center py-4 px-6 font-semibold">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentSalesForTable.map((sale) => (
                      <TableRow key={sale.id} className="hover:bg-muted/50 transition-colors">
                        {/* @ts-ignore: createdAt es un Timestamp de Firestore */}
                        <TableCell className="py-3 px-6">{new Date(sale.createdAt.toDate()).toLocaleDateString("es-VE")}</TableCell>
                        <TableCell className="py-3 px-6 font-medium">
                            {getDisplayPaymentMethod(sale)}
                        </TableCell>
                        <TableCell className="py-3 px-6 text-center">
                          <Button
                            onClick={() => handleGenerateInvoice(sale)}
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            disabled={currentBcvRate === 0}
                          >
                            <Download className="w-3 h-3" />
                            Nota de Entrega
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* 🔑 CONTROLES DE PAGINACIÓN */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4 p-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    Mostrando {indexOfFirstSale + 1}–{Math.min(indexOfLastSale, filteredSales.length)} de {filteredSales.length} ventas | Página {currentPage} de {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => paginate(currentPage - 1)}
                      disabled={currentPage === 1}
                      variant="outline"
                      size="icon"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => paginate(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      variant="outline"
                      size="icon"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}