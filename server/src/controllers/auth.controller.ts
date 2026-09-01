import type {Request, Response} from "express";
import {phone} from "../validators/auth.validators";
import type {AuthService} from "../services/auth.service";

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  requestOtp = async (request: Request, response: Response): Promise<void> => {
    const result = await this.auth.requestOtp({
      phoneNumber: phone(request.body?.phoneNumber),
      name: request.body?.name,
      dateOfBirth: request.body?.dateOfBirth,
    });
    response.status(201).json(result);
  };

  verifyOtp = async (request: Request, response: Response): Promise<void> => {
    const result = await this.auth.verifyOtp({challengeId: request.body?.challengeId, otp: request.body?.otp});
    response.json(result);
  };

  getCurrentUser = (request: Request, response: Response): void => {
    response.json({user: this.auth.getCurrentUser(request.auth!.user)});
  };

  logout = async (request: Request, response: Response): Promise<void> => {
    await this.auth.logout(request.auth!.tokenHash);
    response.sendStatus(204);
  };
}
