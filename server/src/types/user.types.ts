export interface User {
  id: string;
  name: string;
  dateOfBirth: string;
  phoneNumber: string;
  phoneVerifiedAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  name: string;
  dateOfBirth: string;
  phoneNumber: string;
  phoneVerifiedAt: string | null;
}

export interface UserRegistrationInput {
  name: string;
  dateOfBirth: string;
  phoneNumber: string;
}
