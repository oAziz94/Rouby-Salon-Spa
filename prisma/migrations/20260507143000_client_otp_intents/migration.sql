-- AlterEnum: add explicit account intents; LOGIN remains for legacy booking OTP flow.
ALTER TYPE "ClientOtpPurpose" ADD VALUE 'SIGN_IN';
ALTER TYPE "ClientOtpPurpose" ADD VALUE 'REGISTER';
