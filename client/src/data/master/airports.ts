/**
 * Airport master data - 40 Indian airports.
 *
 * IATA codes, cities, states and coordinates are real; they are the one part of this
 * prototype that is not synthetic, because route geometry has to be right for the
 * distance-based fare model to produce believable levels. Everything downstream
 * (fares, passenger counts, capacity) is generated.
 */

export type Region = 'North' | 'West' | 'South' | 'East' | 'Northeast' | 'Central' | 'Islands'

export interface Airport {
  readonly iata: string
  readonly name: string
  readonly city: string
  readonly state: string
  readonly region: Region
  readonly lat: number
  readonly lon: number
  /** Metro / tier-1 hubs carry the trunk traffic and anchor the index. */
  readonly isMetro: boolean
}

export const AIRPORTS: readonly Airport[] = [
  { iata: 'DEL', name: 'Indira Gandhi Intl',            city: 'Delhi',              state: 'Delhi',              region: 'North',     lat: 28.5562, lon: 77.1000, isMetro: true },
  { iata: 'BOM', name: 'Chhatrapati Shivaji Maharaj',   city: 'Mumbai',             state: 'Maharashtra',        region: 'West',      lat: 19.0887, lon: 72.8679, isMetro: true },
  { iata: 'BLR', name: 'Kempegowda Intl',               city: 'Bengaluru',          state: 'Karnataka',          region: 'South',     lat: 13.1986, lon: 77.7066, isMetro: true },
  { iata: 'MAA', name: 'Chennai Intl',                  city: 'Chennai',            state: 'Tamil Nadu',         region: 'South',     lat: 12.9941, lon: 80.1709, isMetro: true },
  { iata: 'CCU', name: 'Netaji Subhas Chandra Bose',    city: 'Kolkata',            state: 'West Bengal',        region: 'East',      lat: 22.6547, lon: 88.4467, isMetro: true },
  { iata: 'HYD', name: 'Rajiv Gandhi Intl',             city: 'Hyderabad',          state: 'Telangana',          region: 'South',     lat: 17.2403, lon: 78.4294, isMetro: true },
  { iata: 'GOI', name: 'Goa Intl (Dabolim)',            city: 'Goa',                state: 'Goa',                region: 'West',      lat: 15.3808, lon: 73.8314, isMetro: false },
  { iata: 'COK', name: 'Cochin Intl',                   city: 'Kochi',              state: 'Kerala',             region: 'South',     lat: 10.1520, lon: 76.4019, isMetro: false },
  { iata: 'AMD', name: 'Sardar Vallabhbhai Patel',      city: 'Ahmedabad',          state: 'Gujarat',            region: 'West',      lat: 23.0772, lon: 72.6347, isMetro: true },
  { iata: 'PNQ', name: 'Pune Intl',                     city: 'Pune',               state: 'Maharashtra',        region: 'West',      lat: 18.5822, lon: 73.9197, isMetro: false },
  { iata: 'JAI', name: 'Jaipur Intl',                   city: 'Jaipur',             state: 'Rajasthan',          region: 'North',     lat: 26.8242, lon: 75.8122, isMetro: false },
  { iata: 'LKO', name: 'Chaudhary Charan Singh',        city: 'Lucknow',            state: 'Uttar Pradesh',      region: 'North',     lat: 26.7606, lon: 80.8893, isMetro: false },
  { iata: 'IXC', name: 'Chandigarh Intl',               city: 'Chandigarh',         state: 'Chandigarh',         region: 'North',     lat: 30.6735, lon: 76.7885, isMetro: false },
  { iata: 'PAT', name: 'Jay Prakash Narayan Intl',      city: 'Patna',              state: 'Bihar',              region: 'East',      lat: 25.5913, lon: 85.0880, isMetro: false },
  { iata: 'GAU', name: 'Lokpriya Gopinath Bordoloi',    city: 'Guwahati',           state: 'Assam',              region: 'Northeast', lat: 26.1061, lon: 91.5859, isMetro: false },
  { iata: 'BBI', name: 'Biju Patnaik Intl',             city: 'Bhubaneswar',        state: 'Odisha',             region: 'East',      lat: 20.2444, lon: 85.8178, isMetro: false },
  { iata: 'TRV', name: 'Trivandrum Intl',               city: 'Thiruvananthapuram', state: 'Kerala',             region: 'South',     lat: 8.4821,  lon: 76.9200, isMetro: false },
  { iata: 'VNS', name: 'Lal Bahadur Shastri',           city: 'Varanasi',           state: 'Uttar Pradesh',      region: 'North',     lat: 25.4524, lon: 82.8593, isMetro: false },
  { iata: 'SXR', name: 'Sheikh ul-Alam Intl',           city: 'Srinagar',           state: 'Jammu and Kashmir',  region: 'North',     lat: 33.9871, lon: 74.7742, isMetro: false },
  { iata: 'IXB', name: 'Bagdogra',                      city: 'Siliguri',           state: 'West Bengal',        region: 'East',      lat: 26.6812, lon: 88.3286, isMetro: false },
  { iata: 'NAG', name: 'Dr. Babasaheb Ambedkar Intl',   city: 'Nagpur',             state: 'Maharashtra',        region: 'Central',   lat: 21.0922, lon: 79.0472, isMetro: false },
  { iata: 'IDR', name: 'Devi Ahilyabai Holkar',         city: 'Indore',             state: 'Madhya Pradesh',     region: 'Central',   lat: 22.7218, lon: 75.8011, isMetro: false },
  { iata: 'BHO', name: 'Raja Bhoj',                     city: 'Bhopal',             state: 'Madhya Pradesh',     region: 'Central',   lat: 23.2875, lon: 77.3374, isMetro: false },
  { iata: 'RPR', name: 'Swami Vivekananda',             city: 'Raipur',             state: 'Chhattisgarh',       region: 'Central',   lat: 21.1804, lon: 81.7388, isMetro: false },
  { iata: 'VTZ', name: 'Visakhapatnam Intl',            city: 'Visakhapatnam',      state: 'Andhra Pradesh',     region: 'South',     lat: 17.7211, lon: 83.2245, isMetro: false },
  { iata: 'IXM', name: 'Madurai Intl',                  city: 'Madurai',            state: 'Tamil Nadu',         region: 'South',     lat: 9.8345,  lon: 78.0934, isMetro: false },
  { iata: 'CJB', name: 'Coimbatore Intl',               city: 'Coimbatore',         state: 'Tamil Nadu',         region: 'South',     lat: 11.0300, lon: 77.0434, isMetro: false },
  { iata: 'TRZ', name: 'Tiruchirappalli Intl',          city: 'Tiruchirappalli',    state: 'Tamil Nadu',         region: 'South',     lat: 10.7654, lon: 78.7097, isMetro: false },
  { iata: 'IXE', name: 'Mangaluru Intl',                city: 'Mangaluru',          state: 'Karnataka',          region: 'South',     lat: 12.9613, lon: 74.8901, isMetro: false },
  { iata: 'HBX', name: 'Hubballi',                      city: 'Hubballi',           state: 'Karnataka',          region: 'South',     lat: 15.3617, lon: 75.0849, isMetro: false },
  { iata: 'STV', name: 'Surat Intl',                    city: 'Surat',              state: 'Gujarat',            region: 'West',      lat: 21.1141, lon: 72.7418, isMetro: false },
  { iata: 'BDQ', name: 'Vadodara',                      city: 'Vadodara',           state: 'Gujarat',            region: 'West',      lat: 22.3362, lon: 73.2263, isMetro: false },
  { iata: 'RAJ', name: 'Rajkot Intl (Hirasar)',         city: 'Rajkot',             state: 'Gujarat',            region: 'West',      lat: 22.3092, lon: 70.7795, isMetro: false },
  { iata: 'JDH', name: 'Jodhpur',                       city: 'Jodhpur',            state: 'Rajasthan',          region: 'North',     lat: 26.2511, lon: 73.0489, isMetro: false },
  { iata: 'UDR', name: 'Maharana Pratap',               city: 'Udaipur',            state: 'Rajasthan',          region: 'North',     lat: 24.6177, lon: 73.8961, isMetro: false },
  { iata: 'DED', name: 'Jolly Grant',                   city: 'Dehradun',           state: 'Uttarakhand',        region: 'North',     lat: 30.1897, lon: 78.1803, isMetro: false },
  { iata: 'IXR', name: 'Birsa Munda',                   city: 'Ranchi',             state: 'Jharkhand',          region: 'East',      lat: 23.3143, lon: 85.3217, isMetro: false },
  { iata: 'IMF', name: 'Bir Tikendrajit Intl',          city: 'Imphal',             state: 'Manipur',            region: 'Northeast', lat: 24.7600, lon: 93.8967, isMetro: false },
  { iata: 'IXZ', name: 'Veer Savarkar Intl',            city: 'Port Blair',         state: 'Andaman and Nicobar',region: 'Islands',   lat: 11.6412, lon: 92.7297, isMetro: false },
  { iata: 'ATQ', name: 'Sri Guru Ram Dass Jee Intl',    city: 'Amritsar',           state: 'Punjab',             region: 'North',     lat: 31.7096, lon: 74.7973, isMetro: false },
]

export const AIRPORT_BY_IATA: ReadonlyMap<string, Airport> = new Map(
  AIRPORTS.map((a) => [a.iata, a]),
)

export function airport(iata: string): Airport {
  const a = AIRPORT_BY_IATA.get(iata)
  if (!a) throw new Error(`Unknown airport ${iata}`)
  return a
}

/** Great-circle distance in km. Mean Earth radius; adequate at these scales. */
export function haversineKm(a: Airport, b: Airport): number {
  const R = 6371.0088
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLon = (b.lon - a.lon) * toRad
  const la1 = a.lat * toRad
  const la2 = b.lat * toRad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
