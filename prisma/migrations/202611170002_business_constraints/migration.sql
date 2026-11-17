CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE users ADD CONSTRAINT normalized_email CHECK (email = lower(btrim(email)));
ALTER TABLE services ADD CONSTRAINT service_values CHECK (price >= 0 AND duration_minutes > 0 AND currency = 'BDT');
ALTER TABLE package_items ADD CONSTRAINT package_item_values CHECK (quantity > 0 AND package_id <> service_id);
ALTER TABLE offers ADD CONSTRAINT offer_values CHECK (
  starts_at < ends_at AND discount_value > 0 AND
  (discount_type <> 'PERCENTAGE' OR discount_value <= 100)
);
ALTER TABLE business_hours ADD CONSTRAINT hours_values CHECK (
  day_of_week BETWEEN 0 AND 6 AND
  opens_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
  closes_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND opens_at < closes_at
);
ALTER TABLE appointment_slots ADD CONSTRAINT slot_interval CHECK (starts_at < ends_at);
ALTER TABLE appointments ADD CONSTRAINT appointment_values CHECK (
  starts_at < ends_at AND base_price >= 0 AND price >= 0 AND duration_minutes > 0
);
ALTER TABLE appointments ADD CONSTRAINT appointments_bay_no_overlap
  EXCLUDE USING gist (bay_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status IN ('PENDING', 'CONFIRMED'));
CREATE UNIQUE INDEX appointments_active_slot ON appointments(slot_id)
  WHERE status IN ('PENDING', 'CONFIRMED');

-- Protect composition even when data is edited outside the API.
CREATE FUNCTION validate_package_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT type FROM services WHERE id = NEW.package_id) <> 'PACKAGE' OR
     (SELECT type FROM services WHERE id = NEW.service_id) <> 'INDIVIDUAL' THEN
    RAISE EXCEPTION 'Package contents must reference individual services' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER package_item_types BEFORE INSERT OR UPDATE ON package_items
  FOR EACH ROW EXECUTE FUNCTION validate_package_item();
CREATE FUNCTION protect_service_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type <> OLD.type AND EXISTS (
    SELECT 1 FROM package_items WHERE package_id = OLD.id OR service_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Cannot change the type of a composed service' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER service_type_immutable BEFORE UPDATE OF type ON services
  FOR EACH ROW EXECUTE FUNCTION protect_service_type();
