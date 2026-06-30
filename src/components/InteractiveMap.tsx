import React, { useState, useMemo, useEffect } from "react";
import { Search, AlertTriangle, Navigation, Eye, EyeOff } from "lucide-react";
import { Issue } from "../types";
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";

interface InteractiveMapProps {
  issues: Issue[];
  selectedIssueId?: string;
  onSelectIssue: (issue: Issue) => void;
  onSelectCoordinates?: (lat: number, lng: number, address: string) => void;
  interactiveMode?: boolean; // if true, allows clicking to set coordinates
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  height?: string;
}

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  "AIzaSyCM-Ym06shzn3M0p10gqChx9KC0kDvgCqM";

const hasValidKey = Boolean(API_KEY) && API_KEY !== "" && API_KEY !== "YOUR_API_KEY";

// Helper component to pan the map dynamically when selection changes
function MapUpdater({ center, zoom }: { center: { lat: number; lng: number } | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (map && center) {
      map.panTo(center);
      if (zoom) {
        map.setZoom(zoom);
      }
    }
  }, [map, center, zoom]);
  return null;
}

// Component to dynamically capture visible area bounds
function ViewportStatsTracker({ onBoundsChange }: { onBoundsChange: (bounds: google.maps.LatLngBounds | null) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    
    const updateBounds = () => {
      onBoundsChange(map.getBounds() || null);
    };

    const boundsListener = map.addListener("bounds_changed", updateBounds);
    const idleListener = map.addListener("idle", updateBounds);
    
    // Set initial bounds
    updateBounds();
    
    return () => {
      boundsListener.remove();
      idleListener.remove();
    };
  }, [map, onBoundsChange]);
  
  return null;
}

interface SearchAutocompleteProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSelectLocation: (lat: number, lng: number, address: string) => void;
  onSearchSubmit: (e?: React.FormEvent | React.KeyboardEvent) => void;
}

function SearchAutocomplete({ searchQuery, setSearchQuery, onSelectLocation, onSearchSubmit }: SearchAutocompleteProps) {
  const places = useMapsLibrary("places");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const options: google.maps.places.AutocompleteOptions = {
      fields: ["geometry", "formatted_address", "name"],
      componentRestrictions: { country: "in" } // restrict results specifically to India!
    };

    const autocompleteInstance = new places.Autocomplete(inputRef.current, options);
    setAutocomplete(autocompleteInstance);
  }, [places]);

  useEffect(() => {
    if (!autocomplete) return;

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place.geometry && place.geometry.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const formattedAddress = place.formatted_address || place.name || searchQuery;
        
        setSearchQuery(formattedAddress);
        onSelectLocation(lat, lng, formattedAddress);
      }
    });

    return () => {
      listener.remove();
    };
  }, [autocomplete, setSearchQuery, onSelectLocation, searchQuery]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search landmark or locality in India..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSearchSubmit(e);
          }
        }}
        className="bg-slate-950 border border-slate-800 text-slate-200 pl-9 pr-4 py-2 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 w-48 md:w-64 transition-all"
      />
    </div>
  );
}

export default function InteractiveMap({
  issues,
  selectedIssueId,
  onSelectIssue,
  onSelectCoordinates,
  interactiveMode = false,
  searchQuery: parentSearchQuery,
  onSearchChange,
  height = "h-[520px]",
}: InteractiveMapProps) {
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const searchQuery = parentSearchQuery !== undefined ? parentSearchQuery : localSearchQuery;
  const setSearchQuery = (val: string) => {
    setLocalSearchQuery(val);
    if (onSearchChange) {
      onSearchChange(val);
    }
  };
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [simulatedPin, setSimulatedPin] = useState<{ lat: number; lng: number; address: string } | null>(null);
  
  // Status filter state
  const [showPending, setShowPending] = useState(true);
  const [showVerified, setShowVerified] = useState(true);
  const [showActive, setShowActive] = useState(true);

  // Map Bounds state
  const [mapBounds, setMapBounds] = useState<google.maps.LatLngBounds | null>(null);

  // Track center and zoom for panning transitions
  const [panCenter, setPanCenter] = useState<{ lat: number; lng: number } | null>({ lat: 12.9716, lng: 77.5946 });
  const [panZoom, setPanZoom] = useState<number | undefined>(13);

  // Pan to selected issue location automatically when selection changes
  useEffect(() => {
    if (selectedIssueId) {
      const selectedIssue = issues.find(i => i.id === selectedIssueId);
      if (selectedIssue) {
        setPanCenter({ lat: selectedIssue.location.lat, lng: selectedIssue.location.lng });
        setPanZoom(15);
      }
    }
  }, [selectedIssueId, issues]);

  // Track previous query to avoid redundant panning while typing
  const [lastPannedQuery, setLastPannedQuery] = useState("");

  const indianCities: { [key: string]: { lat: number; lng: number; address: string } } = {
    mumbai: { lat: 19.0760, lng: 72.8777, address: "Mumbai, Maharashtra, India" },
    delhi: { lat: 28.6139, lng: 77.2090, address: "New Delhi, Delhi, India" },
    kolkata: { lat: 22.5726, lng: 88.3639, address: "Kolkata, West Bengal, India" },
    chennai: { lat: 13.0827, lng: 80.2707, address: "Chennai, Tamil Nadu, India" },
    bangalore: { lat: 12.9716, lng: 77.5946, address: "Bengaluru, Karnataka, India" },
    bengaluru: { lat: 12.9716, lng: 77.5946, address: "Bengaluru, Karnataka, India" },
    hyderabad: { lat: 17.3850, lng: 78.4867, address: "Hyderabad, Telangana, India" },
    ahmedabad: { lat: 23.0225, lng: 72.5714, address: "Ahmedabad, Gujarat, India" },
    pune: { lat: 18.5204, lng: 73.8567, address: "Pune, Maharashtra, India" },
    surat: { lat: 21.1702, lng: 72.8311, address: "Surat, Gujarat, India" },
    jaipur: { lat: 26.9124, lng: 75.7873, address: "Jaipur, Rajasthan, India" },
    lucknow: { lat: 26.8467, lng: 80.9462, address: "Lucknow, Uttar Pradesh, India" },
    kanpur: { lat: 26.4499, lng: 80.3319, address: "Kanpur, Uttar Pradesh, India" },
    nagpur: { lat: 21.1458, lng: 79.0882, address: "Nagpur, Maharashtra, India" },
    indore: { lat: 22.7196, lng: 75.8577, address: "Indore, Madhya Pradesh, India" },
    thane: { lat: 19.2183, lng: 72.9781, address: "Thane, Maharashtra, India" },
    bhopal: { lat: 23.2599, lng: 77.4126, address: "Bhopal, Madhya Pradesh, India" },
    visakhapatnam: { lat: 17.6868, lng: 83.2185, address: "Visakhapatnam, Andhra Pradesh, India" },
    patna: { lat: 25.5941, lng: 85.1376, address: "Patna, Bihar, India" },
    vadodara: { lat: 22.3072, lng: 73.1812, address: "Vadodara, Gujarat, India" },
    ghaziabad: { lat: 28.6692, lng: 77.4538, address: "Ghaziabad, Uttar Pradesh, India" },
    ludhiana: { lat: 30.9010, lng: 75.8573, address: "Ludhiana, Punjab, India" },
    agra: { lat: 27.1767, lng: 78.0081, address: "Agra, Uttar Pradesh, India" },
    nashik: { lat: 19.9975, lng: 73.7898, address: "Nashik, Maharashtra, India" },
    ranchi: { lat: 23.3441, lng: 85.3096, address: "Ranchi, Jharkhand, India" },
    faridabad: { lat: 28.4089, lng: 77.3178, address: "Faridabad, Haryana, India" },
    meerut: { lat: 28.9845, lng: 77.7064, address: "Meerut, Uttar Pradesh, India" },
    rajkot: { lat: 22.3039, lng: 70.8022, address: "Rajkot, Gujarat, India" },
    kalyan: { lat: 19.2403, lng: 73.1305, address: "Kalyan, Maharashtra, India" },
    vasai: { lat: 19.3819, lng: 72.8258, address: "Vasai-Virar, Maharashtra, India" },
    varanasi: { lat: 25.3176, lng: 83.0064, address: "Varanasi, Uttar Pradesh, India" },
    srinagar: { lat: 34.0837, lng: 74.7973, address: "Srinagar, Jammu and Kashmir, India" },
    aurangabad: { lat: 19.8762, lng: 75.3433, address: "Aurangabad, Maharashtra, India" },
    dhanbad: { lat: 23.7957, lng: 86.4304, address: "Dhanbad, Jharkhand, India" },
    amritsar: { lat: 31.6340, lng: 74.8723, address: "Amritsar, Punjab, India" },
    navi_mumbai: { lat: 19.0330, lng: 73.0297, address: "Navi Mumbai, Maharashtra, India" },
    allahabad: { lat: 25.4358, lng: 81.8463, address: "Prayagraj, Uttar Pradesh, India" },
    prayagraj: { lat: 25.4358, lng: 81.8463, address: "Prayagraj, Uttar Pradesh, India" },
    howrah: { lat: 22.5958, lng: 88.2636, address: "Howrah, West Bengal, India" },
    gwalior: { lat: 26.2183, lng: 78.1828, address: "Gwalior, Madhya Pradesh, India" },
    jabalpur: { lat: 23.1815, lng: 79.9864, address: "Jabalpur, Madhya Pradesh, India" },
    coimbatore: { lat: 11.0168, lng: 76.9558, address: "Coimbatore, Tamil Nadu, India" },
    vijayawada: { lat: 16.5062, lng: 80.6480, address: "Vijayawada, Andhra Pradesh, India" },
    jodhpur: { lat: 26.2389, lng: 73.0243, address: "Jodhpur, Rajasthan, India" },
    madurai: { lat: 9.9252, lng: 78.1198, address: "Madurai, Tamil Nadu, India" },
    raipur: { lat: 21.2514, lng: 81.6296, address: "Raipur, Chhattisgarh, India" },
    kota: { lat: 25.2138, lng: 75.8648, address: "Kota, Rajasthan, India" },
    chandigarh: { lat: 30.7333, lng: 76.7794, address: "Chandigarh, India" },
    guwahati: { lat: 26.1445, lng: 91.7362, address: "Guwahati, Assam, India" },
    noida: { lat: 28.5355, lng: 77.3910, address: "Noida, Uttar Pradesh, India" },
    gurgaon: { lat: 28.4595, lng: 77.0266, address: "Gurugram, Haryana, India" },
    gurugram: { lat: 28.4595, lng: 77.0266, address: "Gurugram, Haryana, India" },
    kochi: { lat: 9.9312, lng: 76.2673, address: "Kochi, Kerala, India" },
    trivandrum: { lat: 8.5241, lng: 76.9366, address: "Thiruvananthapuram, Kerala, India" },
    thiruvananthapuram: { lat: 8.5241, lng: 76.9366, address: "Thiruvananthapuram, Kerala, India" },
    bhubaneswar: { lat: 20.2961, lng: 85.8245, address: "Bhubaneswar, Odisha, India" },
    dehradun: { lat: 30.3165, lng: 78.0322, address: "Dehradun, Uttarakhand, India" },
    shimla: { lat: 31.1048, lng: 77.1734, address: "Shimla, Himachal Pradesh, India" },
    goa: { lat: 15.2993, lng: 74.1240, address: "Goa, India" },
  };

  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number; address: string }> => {
    const addr = address.trim();
    if (!addr) return { lat: 20.5937, lng: 78.9629, address: "" };

    // 1. Try Google Geocoding API if key is available
    if (API_KEY) {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr + ", India")}&key=${API_KEY}`
        );
        const data = await response.json();
        if (data.status === "OK" && data.results && data.results.length > 0) {
          const loc = data.results[0].geometry.location;
          const formatted = data.results[0].formatted_address;
          return { lat: loc.lat, lng: loc.lng, address: formatted };
        }
      } catch (err) {
        console.warn("Google Geocoding failed, falling back", err);
      }
    }

    // 2. Try OpenStreetMap Nominatim for free real geocoding
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr + ", India")}&limit=1`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "CivicGuardianIndia/1.0"
          }
        }
      );
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          address: data[0].display_name
        };
      }
    } catch (err) {
      console.warn("OSM Nominatim Geocoding failed, falling back", err);
    }

    // 3. Fallback dictionary
    const lower = addr.toLowerCase();
    
    if (lower.includes("indiranagar")) return { lat: 12.97189, lng: 77.64115, address: "Indiranagar, Bengaluru, Karnataka, India" };
    if (lower.includes("koramangala")) return { lat: 12.93496, lng: 77.61012, address: "Koramangala, Bengaluru, Karnataka, India" };
    if (lower.includes("mg road") || lower.includes("m.g. road")) return { lat: 12.97401, lng: 77.60100, address: "MG Road, Bengaluru, Karnataka, India" };
    if (lower.includes("hsr")) return { lat: 12.91162, lng: 77.63886, address: "HSR Layout, Bengaluru, Karnataka, India" };
    if (lower.includes("whitefield")) return { lat: 12.96981, lng: 77.74997, address: "Whitefield, Bengaluru, Karnataka, India" };
    if (lower.includes("jayanagar")) return { lat: 12.92927, lng: 77.58242, address: "Jayanagar, Bengaluru, Karnataka, India" };
    if (lower.includes("malleswaram") || lower.includes("malleshwaram")) return { lat: 12.99701, lng: 77.57129, address: "Malleswaram, Bengaluru, Karnataka, India" };
    if (lower.includes("hebbal")) return { lat: 13.03535, lng: 77.59879, address: "Hebbal, Bengaluru, Karnataka, India" };
    if (lower.includes("cubbon")) return { lat: 12.9763, lng: 77.5929, address: "Cubbon Park, Bengaluru, Karnataka, India" };

    for (const key of Object.keys(indianCities)) {
      if (lower.includes(key)) {
        return indianCities[key];
      }
    }

    // India boundary box limits random fallback
    const lat = 8.4 + Math.random() * (34.0 - 8.4);
    const lng = 68.7 + Math.random() * (95.0 - 68.7);
    return { lat, lng, address: `${addr}, India` };
  };

  // Automatically pan map to matching location when searchQuery changes (debounced)
  useEffect(() => {
    if (!searchQuery) return;
    if (searchQuery === lastPannedQuery) return;

    const lowercaseQuery = searchQuery.toLowerCase();
    
    // Check if query is a known locality or longer than 3 characters to start scanning
    const isKnown = ["indiranagar", "koramangala", "whitefield", "hsr", "jayanagar", "malleswaram", "malleshwaram", "hebbal", "mg road", "cubbon"].some(loc => 
      lowercaseQuery.includes(loc)
    );

    if (!isKnown && lowercaseQuery.length < 4) return;

    const handler = setTimeout(async () => {
      const coords = await geocodeAddress(searchQuery);
      if (coords) {
        setPanCenter({ lat: coords.lat, lng: coords.lng });
        const isCitySearch = ["mumbai", "delhi", "kolkata", "chennai", "bangalore", "bengaluru", "hyderabad", "ahmedabad", "pune", "jaipur", "goa", "india"].some(c => lowercaseQuery.includes(c));
        setPanZoom(isCitySearch ? 11 : 14);
        setLastPannedQuery(searchQuery);
        
        // In interactive mode, let's place a pin as well
        if (interactiveMode) {
          setSimulatedPin({
            lat: coords.lat,
            lng: coords.lng,
            address: coords.address
          });
          if (onSelectCoordinates) {
            onSelectCoordinates(coords.lat, coords.lng, coords.address);
          }
        }
      }
    }, 600);

    return () => clearTimeout(handler);
  }, [searchQuery, interactiveMode, lastPannedQuery, onSelectCoordinates]);

  const handleSearchSubmit = async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery) return;
    
    const coords = await geocodeAddress(searchQuery);
    setSimulatedPin({
      lat: coords.lat,
      lng: coords.lng,
      address: coords.address
    });
    setPanCenter({ lat: coords.lat, lng: coords.lng });
    
    const lowercaseQuery = searchQuery.toLowerCase();
    const isCitySearch = ["mumbai", "delhi", "kolkata", "chennai", "bangalore", "bengaluru", "hyderabad", "ahmedabad", "pune", "jaipur", "goa", "india"].some(c => lowercaseQuery.includes(c));
    setPanZoom(isCitySearch ? 11 : 14);

    if (onSelectCoordinates) {
      onSelectCoordinates(coords.lat, coords.lng, coords.address);
    }
  };

  const filteredIssues = useMemo(() => {
    return issues.filter(i => {
      const matchCategory = categoryFilter === "All" || i.category === categoryFilter;
      const isKnownLocality = ["indiranagar", "koramangala", "whitefield", "hsr", "jayanagar", "malleswaram", "malleshwaram", "hebbal", "mg road"].some(loc => 
        searchQuery.toLowerCase().includes(loc)
      );
      const matchSearch = !searchQuery || 
                          isKnownLocality ||
                          i.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          i.location.address.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [issues, categoryFilter, searchQuery]);

  // Filter issues to display based on selected status checkboxes
  const visibleIssuesToRender = useMemo(() => {
    return filteredIssues.filter((issue) => {
      if (issue.status === "submitted") return showPending;
      if (issue.status === "verified" || issue.status === "assigned") return showVerified;
      if (issue.status === "in_progress") return showActive;
      return true; // render others (e.g. completed)
    });
  }, [filteredIssues, showPending, showVerified, showActive]);

  // Real-time visible bounds statistics (calculates live based on map area)
  const visibleStats = useMemo(() => {
    let pending = 0;
    let verified = 0;
    let active = 0;

    filteredIssues.forEach((issue) => {
      let isInside = true;
      if (mapBounds) {
        const lat = issue.location.lat;
        const lng = issue.location.lng;
        const ne = mapBounds.getNorthEast();
        const sw = mapBounds.getSouthWest();
        if (ne && sw) {
          const latMin = Math.min(sw.lat(), ne.lat());
          const latMax = Math.max(sw.lat(), ne.lat());
          const lngMin = Math.min(sw.lng(), ne.lng());
          const lngMax = Math.max(sw.lng(), ne.lng());
          isInside = lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax;
        }
      }

      if (isInside) {
        if (issue.status === "submitted") {
          pending++;
        } else if (issue.status === "verified" || issue.status === "assigned") {
          verified++;
        } else if (issue.status === "in_progress") {
          active++;
        }
      }
    });

    return { pending, verified, active };
  }, [filteredIssues, mapBounds]);

  const handleMapClick = (e: any) => {
    if (!interactiveMode || !onSelectCoordinates) return;
    const latLng = e.detail.latLng;
    if (!latLng) return;
    
    const lat = latLng.lat;
    const lng = latLng.lng;
    
    const localities = ["Indiranagar", "Koramangala", "MG Road", "HSR Layout", "Whitefield", "Jayanagar", "Malleshwaram", "Hebbal"];
    const roads = ["Main Road", "Cross Road", "Ring Road", "Airport Road", "Church Street", "Brigade Road"];
    const randomLocality = localities[Math.floor(Math.random() * localities.length)];
    const randomRoad = roads[Math.floor(Math.random() * roads.length)];
    const mockAddress = `House #${Math.floor(10 + Math.random() * 190)}, ${Math.floor(1 + Math.random() * 15)}th ${randomRoad}, ${randomLocality}, Bengaluru, Karnataka 560001`;
    
    setSimulatedPin({ lat, lng, address: mockAddress });
    setPanCenter({ lat, lng });
    onSelectCoordinates(lat, lng, mockAddress);
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "Road Damage": return "#f59e0b"; // amber
      case "Water Leakage": return "#0ea5e9"; // sky
      case "Electricity": return "#eab308"; // yellow
      case "Garbage": return "#10b981"; // emerald
      case "Public Safety": return "#ef4444"; // red
      default: return "#8b5cf6"; // purple
    }
  };

  if (!hasValidKey) {
    return (
      <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 flex flex-col h-[520px] shadow-2xl justify-center items-center text-center">
        <div className="max-w-md space-y-4">
          <div className="h-12 w-12 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto border border-amber-500/30">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-100">Google Maps API Key Required</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            A real interactive Google Map requires an API Key. Please follow these simple steps to set it up:
          </p>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-left space-y-2 text-xs text-slate-300">
            <p><strong>1. Get an API Key:</strong> <a href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline font-semibold">Get key from Google Cloud Console</a></p>
            <p><strong>2. Configure in AI Studio:</strong></p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li>Open <strong>Settings</strong> (⚙️ gear icon, top-right corner)</li>
              <li>Select <strong>Secrets</strong></li>
              <li>Type <code className="text-sky-300 bg-sky-950/40 px-1 py-0.5 rounded">GOOGLE_MAPS_PLATFORM_KEY</code> as the secret name</li>
              <li>Paste your API key as the value, and press <strong>Enter</strong></li>
            </ul>
          </div>
          <p className="text-[10px] text-slate-500">
            The application will rebuild and render the live real-world map automatically once the key is added.
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <div className={`bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl overflow-hidden p-5 flex flex-col ${height} shadow-2xl relative`}>
      {/* Map Control Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 z-10">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Navigation className="h-5 w-5 text-sky-400 animate-pulse" />
            Live Civic Google Map
          </h3>
          <p className="text-xs text-slate-400">
            {interactiveMode 
              ? "Click anywhere on the map to drop a pin and set report location" 
              : "Showing live active, verified and pending problems around Bengaluru, India"}
          </p>
        </div>

        <div className="flex gap-2">
          <SearchAutocomplete
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onSelectLocation={(lat, lng, address) => {
              setPanCenter({ lat, lng });
              setPanZoom(14);
              setSimulatedPin({ lat, lng, address });
              if (onSelectCoordinates) {
                onSelectCoordinates(lat, lng, address);
              }
            }}
            onSearchSubmit={handleSearchSubmit}
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all"
          >
            <option value="All">All Categories</option>
            <option value="Road Damage">Road Damage</option>
            <option value="Water Leakage">Water Leakage</option>
            <option value="Electricity">Electricity</option>
            <option value="Garbage">Garbage</option>
            <option value="Public Safety">Public Safety</option>
          </select>
        </div>
      </div>

      {/* Quick Jump Hotspot Neighborhood Chips */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3.5 z-10 text-[11px] bg-slate-950/20 p-2 rounded-xl border border-slate-800/40">
        <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Test Area Hotspots:
        </span>
        {[
          { name: "Indiranagar", center: { lat: 12.97189, lng: 77.64115 } },
          { name: "Koramangala", center: { lat: 12.93496, lng: 77.61012 } },
          { name: "Whitefield", center: { lat: 12.96981, lng: 77.74997 } },
          { name: "HSR Layout", center: { lat: 12.91162, lng: 77.63886 } },
          { name: "Jayanagar", center: { lat: 12.92927, lng: 77.58242 } },
          { name: "Malleshwaram", center: { lat: 12.99701, lng: 77.57129 } },
          { name: "Hebbal", center: { lat: 13.03535, lng: 77.59879 } },
          { name: "MG Road", center: { lat: 12.97401, lng: 77.60100 } }
        ].map((area) => (
          <button
            key={area.name}
            type="button"
            onClick={() => {
              setSearchQuery(area.name);
              setPanCenter(area.center);
              setPanZoom(14);
              setSimulatedPin({
                lat: area.center.lat,
                lng: area.center.lng,
                address: `${area.name}, Bengaluru, Karnataka`
              });
              if (onSelectCoordinates) {
                onSelectCoordinates(area.center.lat, area.center.lng, `${area.name}, Bengaluru, Karnataka`);
              }
            }}
            className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold transition-all cursor-pointer ${
              searchQuery.toLowerCase().includes(area.name.toLowerCase())
                ? "bg-sky-500/20 border-sky-400/50 text-sky-300 shadow-md shadow-sky-500/5"
                : "bg-slate-950/40 border-slate-800/80 text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
            }`}
          >
            {area.name}
          </button>
        ))}
      </div>

      {/* Horizontal Counters for Mobile */}
      {!interactiveMode && (
        <div className="flex flex-wrap gap-2 mb-3 bg-slate-950/45 p-1.5 rounded-xl border border-slate-800/50 md:hidden z-10">
          <button
            onClick={() => setShowPending(!showPending)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-semibold transition-all ${
              showPending ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-slate-950/20 border-slate-900 text-slate-500"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${showPending ? "bg-amber-400" : "bg-slate-700"}`} />
            Pending ({visibleStats.pending})
          </button>
          <button
            onClick={() => setShowVerified(!showVerified)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-semibold transition-all ${
              showVerified ? "bg-sky-500/10 border-sky-500/30 text-sky-300" : "bg-slate-950/20 border-slate-900 text-slate-500"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${showVerified ? "bg-sky-400" : "bg-slate-700"}`} />
            Verified ({visibleStats.verified})
          </button>
          <button
            onClick={() => setShowActive(!showActive)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-semibold transition-all ${
              showActive ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" : "bg-slate-950/20 border-slate-900 text-slate-500"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${showActive ? "bg-indigo-400" : "bg-slate-700"}`} />
            Active ({visibleStats.active})
          </button>
        </div>
      )}

      {/* Main Map Container */}
      <div className="relative flex-1 bg-slate-950 border border-slate-900 rounded-xl overflow-hidden shadow-inner min-h-[200px]">
        
        {/* Floating Desktop Insights and Filter Sidebar Panel */}
        {!interactiveMode && (
          <div className="absolute top-4 left-4 z-10 bg-slate-950/95 backdrop-blur-md border border-slate-800/80 p-3 rounded-xl shadow-2xl w-56 hidden md:flex flex-col gap-2.5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Visible Area Stats</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            
            <div className="space-y-1.5">
              {/* Pending count/toggle */}
              <button
                onClick={() => setShowPending(!showPending)}
                className={`w-full flex items-center justify-between p-1.5 rounded-lg border text-left transition-all ${
                  showPending 
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20" 
                    : "bg-slate-950/40 border-slate-900 text-slate-500 hover:bg-slate-900/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${showPending ? "bg-amber-400" : "bg-slate-700"}`} />
                  <span className="text-[11px] font-semibold">Pending Issues</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                    {visibleStats.pending}
                  </span>
                  {showPending ? <Eye className="h-3.5 w-3.5 text-amber-400/80" /> : <EyeOff className="h-3.5 w-3.5 text-slate-600" />}
                </div>
              </button>

              {/* Verified count/toggle */}
              <button
                onClick={() => setShowVerified(!showVerified)}
                className={`w-full flex items-center justify-between p-1.5 rounded-lg border text-left transition-all ${
                  showVerified 
                    ? "bg-sky-500/10 border-sky-500/20 text-sky-300 hover:bg-sky-500/20" 
                    : "bg-slate-950/40 border-slate-900 text-slate-500 hover:bg-slate-900/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${showVerified ? "bg-sky-400" : "bg-slate-700"}`} />
                  <span className="text-[11px] font-semibold">Verified Issues</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                    {visibleStats.verified}
                  </span>
                  {showVerified ? <Eye className="h-3.5 w-3.5 text-sky-400/80" /> : <EyeOff className="h-3.5 w-3.5 text-slate-600" />}
                </div>
              </button>

              {/* Active count/toggle */}
              <button
                onClick={() => setShowActive(!showActive)}
                className={`w-full flex items-center justify-between p-1.5 rounded-lg border text-left transition-all ${
                  showActive 
                    ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20" 
                    : "bg-slate-950/40 border-slate-900 text-slate-500 hover:bg-slate-900/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${showActive ? "bg-indigo-400" : "bg-slate-700"}`} />
                  <span className="text-[11px] font-semibold">In Progress (Active)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                    {visibleStats.active}
                  </span>
                  {showActive ? <Eye className="h-3.5 w-3.5 text-indigo-400/80" /> : <EyeOff className="h-3.5 w-3.5 text-slate-600" />}
                </div>
              </button>
            </div>
            
            <div className="text-[9px] text-slate-500 text-center italic border-t border-slate-800/40 pt-1.5">
              Move map to filter area problems
            </div>
          </div>
        )}

        <Map
            defaultCenter={{ lat: 20.5937, lng: 78.9629 }}
            defaultZoom={5}
            mapId="DEMO_MAP_ID"
            gestureHandling="greedy"
            disableDefaultUI={false}
            onClick={handleMapClick}
            style={{ width: "100%", height: "100%" }}
            internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
          >
            <MapUpdater center={panCenter} zoom={panZoom} />
            <ViewportStatsTracker onBoundsChange={setMapBounds} />

            {/* Render Active Issue Markers */}
            {visibleIssuesToRender.map((issue) => {
              const color = getCategoryColor(issue.category);
              const isSelected = issue.id === selectedIssueId;
              return (
                <AdvancedMarker
                  key={issue.id}
                  position={{ lat: issue.location.lat, lng: issue.location.lng }}
                  title={issue.title}
                  onClick={() => onSelectIssue(issue)}
                >
                  <Pin 
                    background={color} 
                    borderColor={isSelected ? "#ffffff" : "#1e293b"} 
                    glyphColor="#ffffff" 
                    scale={isSelected ? 1.25 : 1.0}
                  />
                </AdvancedMarker>
              );
            })}

            {/* Render User's Selected Pin */}
            {simulatedPin && (
              <AdvancedMarker
                position={{ lat: simulatedPin.lat, lng: simulatedPin.lng }}
                title="Dropped Report Location"
              >
                <Pin 
                  background="#10b981" 
                  borderColor="#ffffff" 
                  glyphColor="#ffffff" 
                  scale={1.3}
                />
              </AdvancedMarker>
            )}
          </Map>

        {/* Selected Issue Info Overlay Banner */}
        {selectedIssueId && (
          <div className="absolute bottom-3 left-3 right-3 bg-slate-900/95 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between shadow-2xl backdrop-blur-md animate-fade-in z-20">
            {(() => {
              const selectedIssue = issues.find(i => i.id === selectedIssueId);
              if (!selectedIssue) return null;
              return (
                <>
                  <div className="flex items-center gap-3">
                    <div 
                      className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${getCategoryColor(selectedIssue.category)}20` }}
                    >
                      <AlertTriangle 
                        className="h-5 w-5" 
                        style={{ color: getCategoryColor(selectedIssue.category) }} 
                      />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100">{selectedIssue.title}</h4>
                      <p className="text-[10px] text-slate-400 max-w-[200px] truncate">{selectedIssue.location.address}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider text-slate-300 bg-slate-800">
                      {selectedIssue.status.replace("_", " ")}
                    </span>
                    <button
                      onClick={() => onSelectIssue(selectedIssue)}
                      className="text-[10px] bg-sky-500 hover:bg-sky-600 text-white font-semibold px-3 py-1.5 rounded-lg transition-all"
                    >
                      Inspect Details
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
    </APIProvider>
  );
}
