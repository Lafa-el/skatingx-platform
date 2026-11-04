import { isValidDateString } from "./athlete-age";

/** Same cap as the old journal profile editor. */
export const ATHLETE_BIO_MAX_LENGTH = 500;

export type AthleteProfileFormInput = {
  displayName: string;
  birthDate: string;
  skatingStartDate: string;
  country: string;
  bio: string;
};

export type AthleteProfileFormErrors = {
  displayName?: "required";
  birthDate?: "invalid";
  skatingStartDate?: "invalid";
  country?: "required";
  bio?: "tooLong";
};

/** Empty when the form can be saved. Sport is chosen from a fixed list, so it is not checked here. */
export function validateAthleteProfileForm(input: AthleteProfileFormInput): AthleteProfileFormErrors {
  const errors: AthleteProfileFormErrors = {};
  if (input.displayName.trim() === "") {
    errors.displayName = "required";
  }
  if (!isValidDateString(input.birthDate.trim())) {
    errors.birthDate = "invalid";
  }
  const start = input.skatingStartDate.trim();
  if (start !== "" && !isValidDateString(start)) {
    errors.skatingStartDate = "invalid";
  }
  if (input.country.trim() === "") {
    errors.country = "required";
  }
  if (input.bio.length > ATHLETE_BIO_MAX_LENGTH) {
    errors.bio = "tooLong";
  }
  return errors;
}
