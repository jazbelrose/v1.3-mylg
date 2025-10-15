import React, { useState, ChangeEvent } from 'react';
import Map from '@/shared/ui/Map';
import { NOMINATIM_SEARCH_URL, apiFetch } from '@/shared/utils/api';
import styles from './new-project-address.module.css';

interface NominatimResult {
  lat: string;
  lon: string;
  display_name?: string;
}

interface Location {
  lat: number;
  lng: number;
}

interface NewProjectAddressProps {
  address: string;
  setAddress: (address: string) => void;
  location: Location;
  setLocation: (loc: Location) => void;
  style?: React.CSSProperties;
}

const NewProjectAddress: React.FC<NewProjectAddressProps> = ({
  address,
  setAddress,
  location,
  setLocation,
  style,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [buttonText, setButtonText] = useState('Search');
  const [isLoading, setIsLoading] = useState(false);

  const searchAddress = async (addr: string): Promise<Location | null> => {
    const url = `${NOMINATIM_SEARCH_URL}${encodeURIComponent(addr)}`;
    try {
      const data = await apiFetch<NominatimResult[]>(url);
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
      return null;
    } catch (error) {
      console.error('Error during address search:', error);
      return null;
    }
  };

  const handleSearch = async () => {
    setIsLoading(true);
    setButtonText('Searching...');
    const geocodedLocation = await searchAddress(searchQuery);
    setIsLoading(false);
    if (geocodedLocation) {
      setLocation(geocodedLocation);
      setAddress(searchQuery);
      setButtonText('Updated');
      setTimeout(() => setButtonText('Search'), 2000);
      console.log('Updated Location:', geocodedLocation);
      console.log('Updated Address:', searchQuery);
    } else {
      setButtonText('No Results');
      setTimeout(() => setButtonText('Search'), 2000);
      console.log('No location found for the address.');
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  return (
    <div className={styles.addressContainer} style={style}>
      <div className={styles.mapContainer}>
        <Map
          location={location}
          address={address}
          scrollWheelZoom={true}
          dragging={true}
          touchZoom={true}
          showUserLocation={false}
        />
      </div>
      <div className={styles.addressInputContainer}>
        <input
          type="text"
          className={styles.addressInput}
          value={searchQuery}
          onChange={handleInputChange}
          placeholder="Enter project location"
        />
        <button
          onClick={handleSearch}
          className={styles.addressButton}
          disabled={isLoading}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
};

export default NewProjectAddress;









