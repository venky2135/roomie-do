import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { COLORS } from '../constants/theme';

interface AppDatePickerProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  minDate?: Date;
  placeholder?: string;
  required?: boolean;
}

export default function AppDatePicker({
  label,
  value,
  onChange,
  minDate,
  placeholder = 'Select date',
  required = false,
}: AppDatePickerProps) {
  const [showPicker, setShowPicker] = useState(false);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleNativeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    // On Android, the picker closes automatically
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (event.type !== 'dismissed' && selectedDate) {
      onChange(selectedDate);
    }
  };

  // Cross-platform Web implementation
  if (Platform.OS === 'web') {
    const minStr = minDate ? minDate.toISOString().slice(0, 10) : undefined;
    const valStr = value ? value.toISOString().slice(0, 10) : '';

    return (
      <View style={styles.container}>
        <Text style={styles.label}>
          {label} {required && <Text style={styles.requiredStar}>*</Text>}
        </Text>
        <View style={styles.webInputContainer}>
          <Ionicons
            name="calendar-outline"
            size={14}
            color={value ? COLORS.primary : '#94A3B8'}
            style={{ marginRight: 6 }}
          />
          <input
            type="date"
            min={minStr}
            value={valStr}
            onChange={(e: any) => {
              if (e.target.value) {
                // Parse date at midnight local time to avoid timezone offset shifts
                const [year, month, day] = e.target.value.split('-').map(Number);
                onChange(new Date(year, month - 1, day));
              }
            }}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              fontSize: 11,
              fontFamily: 'inherit',
              color: value ? '#1A1A24' : '#94A3B8',
              cursor: 'pointer',
              fontWeight: value ? '600' : '400',
            }}
          />
        </View>
      </View>
    );
  }

  // Native iOS / Android implementation
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label} {required && <Text style={styles.requiredStar}>*</Text>}
      </Text>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.7}
      >
        <Ionicons
          name="calendar-outline"
          size={14}
          color={value ? COLORS.primary : '#94A3B8'}
        />
        <Text style={[styles.dateText, !value && styles.placeholderText]}>
          {value ? formatDate(value) : placeholder}
        </Text>
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={value || minDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minDate}
          onChange={handleNativeChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 6,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  requiredStar: {
    color: '#EF4444',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  dateText: {
    fontSize: 11,
    color: '#1A1A24',
    fontWeight: '600',
  },
  placeholderText: {
    color: '#94A3B8',
    fontWeight: '400',
  },
  webInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});

